'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Stack, useConfirm } from '@sparx/ui';
import { Trash2 } from 'lucide-react';
import type { FieldDef } from '@sparx/cms-schemas';
import { ContentEntryForm } from '../../../_components/content-entry-form';
import { deleteEntry, setEntryStatus, updateEntry } from '../../actions';

interface Props {
  id: string;
  typeKey: string;
  urlPattern: string | null;
  schema: { fields: FieldDef[] };
  initialBody: Record<string, unknown>;
  initialStatus: string;
}

export function EditEntryForm({
  id,
  typeKey,
  urlPattern,
  schema,
  initialBody,
  initialStatus,
}: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [status, setStatus] = React.useState(initialStatus);
  const [busy, setBusy] = React.useState(false);

  const togglePublish = async () => {
    setBusy(true);
    const next = status === 'published' ? 'draft' : 'published';
    const res = await setEntryStatus(id, typeKey, next);
    if (res.ok) setStatus(next);
    setBusy(false);
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Soft-delete this entry?',
      description:
        'The entry will be hidden from the storefront and lists but kept in the database. You can restore it from the deleted view.',
      confirmLabel: 'Soft-delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    const res = await deleteEntry(id, typeKey);
    setBusy(false);
    if (res.ok) router.push(`/cms/types/${typeKey}`);
  };

  return (
    <Stack gap={5}>
      <Stack direction="row" align="center" justify="end" gap={2}>
        <Button
          type="button"
          variant={status === 'published' ? 'module-outline' : 'module'}
          size="sm"
          onClick={() => void togglePublish()}
          disabled={busy}
        >
          {status === 'published' ? 'Unpublish' : 'Publish'}
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={() => void handleDelete()}
          disabled={busy}
          leftIcon={<Trash2 className="h-3 w-3" />}
        >
          Delete
        </Button>
      </Stack>
      <ContentEntryForm
        schema={schema}
        initialBody={initialBody}
        submitLabel="Save changes"
        onSubmit={async (body) => {
          const slug =
            urlPattern && typeof body.slug === 'string' && body.slug.length > 0
              ? body.slug
              : undefined;
          const res = await updateEntry(id, body, slug);
          return { ok: res.ok, error: res.error };
        }}
      />
    </Stack>
  );
}
