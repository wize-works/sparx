'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Input } from '@sparx/ui';
import { publishNow, schedulePublish } from '../_lib/actions';

export interface PublishBarProps {
  isPublished: boolean;
  /** Whether the draft has changes since the last publish. */
  hasUnpublishedChanges: boolean;
}

export function PublishBar({ isPublished, hasUnpublishedChanges }: PublishBarProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [scheduling, setScheduling] = React.useState(false);
  const [scheduleAt, setScheduleAt] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const doPublish = () => {
    setError(null);
    startTransition(async () => {
      const res = await publishNow();
      if (!res.ok) setError(res.error ?? 'Publish failed.');
      else router.refresh();
    });
  };

  const doSchedule = () => {
    if (!scheduleAt) return;
    setError(null);
    startTransition(async () => {
      const res = await schedulePublish(new Date(scheduleAt).toISOString());
      if (!res.ok) setError(res.error ?? 'Scheduling failed.');
      else {
        setScheduling(false);
        setScheduleAt('');
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-subtle)] px-4 py-3">
      <div className="flex items-center gap-2">
        {isPublished ? (
          <Badge variant={hasUnpublishedChanges ? 'warning' : 'success'}>
            {hasUnpublishedChanges ? 'Unpublished changes' : 'Published'}
          </Badge>
        ) : (
          <Badge variant="secondary">Draft — not published</Badge>
        )}
        {error ? <span className="text-sm text-[var(--color-text-danger)]">{error}</span> : null}
      </div>

      <div className="flex items-center gap-2">
        {scheduling ? (
          <>
            <Input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="w-56"
            />
            <Button variant="secondary" onClick={() => setScheduling(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={doSchedule} disabled={pending || !scheduleAt}>
              Confirm schedule
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setScheduling(true)} disabled={pending}>
              Schedule…
            </Button>
            <Button onClick={doPublish} disabled={pending}>
              {pending ? 'Publishing…' : 'Publish'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
