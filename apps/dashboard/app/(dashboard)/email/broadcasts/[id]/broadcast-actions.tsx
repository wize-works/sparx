'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, Send, X } from 'lucide-react';
import { Button, Input, Stack, Text, toast } from '@sparx/ui';

import { cancelBroadcastAction, scheduleBroadcastAction, sendBroadcastAction } from '../actions';
import type { BroadcastRow } from '../../_lib/types';

export function BroadcastActions({ broadcast }: { broadcast: BroadcastRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [when, setWhen] = useState('');

  function send() {
    startTransition(async () => {
      const result = await sendBroadcastAction(broadcast.id);
      if (result.ok) {
        toast.success(`Sending to ${result.data.recipientCount} recipients.`);
        router.refresh();
      } else toast.error(result.error.message);
    });
  }

  function schedule() {
    if (!when) {
      toast.error('Pick a date and time.');
      return;
    }
    startTransition(async () => {
      const result = await scheduleBroadcastAction(broadcast.id, new Date(when).toISOString());
      if (result.ok) {
        toast.success('Broadcast scheduled.');
        router.refresh();
      } else toast.error(result.error.message);
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelBroadcastAction(broadcast.id);
      if (result.ok) {
        toast.success('Broadcast cancelled.');
        router.refresh();
      } else toast.error(result.error.message);
    });
  }

  if (broadcast.status === 'draft') {
    return (
      <Stack gap={4}>
        <Stack direction="row" align="center" gap={2}>
          <Button variant="module" onClick={send} loading={pending} disabled={pending}>
            <Send className="h-4 w-4" />
            Send now
          </Button>
        </Stack>
        <Stack direction="row" align="end" gap={2}>
          <Stack gap={1}>
            <Text size="sm" variant="muted">
              Or schedule for later
            </Text>
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              disabled={pending}
              className="w-60"
            />
          </Stack>
          <Button variant="outline" onClick={schedule} loading={pending} disabled={pending}>
            <CalendarClock className="h-4 w-4" />
            Schedule
          </Button>
        </Stack>
      </Stack>
    );
  }

  if (broadcast.status === 'scheduled') {
    return (
      <Stack gap={3}>
        <Text size="sm" variant="muted">
          Scheduled for{' '}
          {broadcast.scheduledAt ? new Date(broadcast.scheduledAt).toLocaleString() : ''}
        </Text>
        <Button variant="outline" onClick={cancel} loading={pending} disabled={pending}>
          <X className="h-4 w-4" />
          Cancel send
        </Button>
      </Stack>
    );
  }

  return null;
}
