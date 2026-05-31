'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, EmptyState, Heading, Text } from '@sparx/ui';
import { cancelSchedule, rollback } from '../_lib/actions';
import type { SitePublishScheduleDto, SiteVersionDto } from '../_lib/types';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'secondary' | 'danger'> = {
  published: 'success',
  pending: 'warning',
  cancelled: 'secondary',
  failed: 'danger',
};

export function PublishingPanel({
  versions,
  schedules,
  publishedVersionId,
}: {
  versions: SiteVersionDto[];
  schedules: SitePublishScheduleDto[];
  publishedVersionId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const act = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <Heading level={3}>Version history</Heading>
        {versions.length === 0 ? (
          <EmptyState
            title="No versions yet"
            description="Publish your site to create the first version."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {versions.map((v) => {
              const isLive = v.id === publishedVersionId;
              return (
                <Card key={v.id} variant="module" padding="sm">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <Text size="sm">
                        <span className="font-medium">v{v.versionNumber}</span>
                        {v.note ? ` — ${v.note}` : ''}
                      </Text>
                      <Text size="xs" variant="muted">
                        {new Date(v.createdAt).toLocaleString()}
                      </Text>
                    </div>
                    {isLive ? (
                      <Badge color="success">Live</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => act(() => rollback(v.id))}
                      >
                        Roll back to this
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <Heading level={3}>Scheduled publishes</Heading>
        {schedules.length === 0 ? (
          <EmptyState
            title="Nothing scheduled"
            description="Schedule a publish from the publish bar in Design or Homepage."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {schedules.map((s) => (
              <Card key={s.id} variant="module" padding="sm">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Text size="sm">{new Date(s.scheduledAt).toLocaleString()}</Text>
                    {s.note ? (
                      <Text size="xs" variant="muted">
                        {s.note}
                      </Text>
                    ) : null}
                    {s.error ? (
                      <Text size="xs" variant="muted">
                        {s.error}
                      </Text>
                    ) : null}
                  </div>
                  <Badge color={STATUS_VARIANT[s.status] ?? 'secondary'}>{s.status}</Badge>
                  {s.status === 'pending' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => act(() => cancelSchedule(s.id))}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
