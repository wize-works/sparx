'use client';

// Manual activity recorder.
//
// Used in the customer detail right rail (and later in the deal detail page).
// Submits via the recordActivityAction Server Action, which routes through
// activityService.record — the single write path that fires the
// crm.activity.recorded event consumers also use.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button, Label, Stack, Text, Textarea } from '@sparx/ui';

import { recordActivityAction } from '../../actions';

type ActivityKind = 'note' | 'call' | 'meeting';

const KIND_LABELS: Record<ActivityKind, string> = {
  note: 'Note',
  call: 'Call',
  meeting: 'Meeting',
};

interface Props {
  customerId?: string;
  dealId?: string;
}

export function RecordActivityForm({ customerId, dealId }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<ActivityKind>('note');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    const desc = (formData.get('description') as string | null)?.trim() ?? '';
    if (!desc) {
      setError('Description is required.');
      return;
    }
    startTransition(async () => {
      const result = await recordActivityAction({
        type: kind,
        description: desc,
        actorType: 'staff',
        ...(customerId ? { customerId } : {}),
        ...(dealId ? { dealId } : {}),
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setDescription('');
      router.refresh();
    });
  }

  return (
    <form action={onSubmit}>
      <Stack gap={3}>
        <Stack direction="row" gap={1}>
          {(Object.keys(KIND_LABELS) as ActivityKind[]).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={k === kind ? 'module' : 'secondary'}
              onClick={() => setKind(k)}
            >
              {KIND_LABELS[k]}
            </Button>
          ))}
        </Stack>

        <Stack gap={1}>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            placeholder={
              kind === 'call'
                ? 'Summary of the call…'
                : kind === 'meeting'
                  ? 'Meeting notes…'
                  : 'Add a note…'
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            required
          />
        </Stack>

        {error && (
          <Text size="xs" variant="danger">
            {error}
          </Text>
        )}

        <Button type="submit" variant="module" disabled={pending}>
          {pending ? 'Saving…' : 'Add activity'}
        </Button>
      </Stack>
    </form>
  );
}
