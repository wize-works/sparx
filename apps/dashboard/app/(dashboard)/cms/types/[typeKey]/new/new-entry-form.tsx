'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { FieldDef } from '@sparx/cms-schemas';
import { ContentEntryForm } from '../../../_components/content-entry-form';
import { createEntry } from '../../actions';

interface Props {
  typeKey: string;
  urlPattern: string | null;
  schema: { fields: FieldDef[] };
}

export function NewEntryForm({ typeKey, urlPattern, schema }: Props) {
  const router = useRouter();

  return (
    <ContentEntryForm
      schema={schema}
      submitLabel="Create draft"
      onSubmit={async (body) => {
        // If the type is routable, pull `slug` straight out of the body
        // (the schema declares a `slug` field). Non-routable types skip the
        // slug arg entirely.
        const slug =
          urlPattern && typeof body.slug === 'string' && body.slug.length > 0
            ? body.slug
            : undefined;
        const res = await createEntry(typeKey, body, slug);
        if (res.ok && res.data?.id) {
          router.push(`/cms/types/${typeKey}/${res.data.id}`);
          return { ok: true };
        }
        return { ok: false, error: res.error };
      }}
    />
  );
}
