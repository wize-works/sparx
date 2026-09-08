'use client';

// Managing one that already exists: change it, pause it, see what it has done,
// delete it.

import { useEffect, useRef, useState } from 'react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import { PANE_SHELL } from '../../components/pane-toolbar';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { serializeDraft, type WebhookDraft } from './webhook-draft';
import { ManageBody } from './webhook-manage-body';
import { useInvalidateWebhooks, useWebhook, type WebhookSubscription } from './webhooks-data';

export function ManageWebhook({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const { webhook, isLoading, isError, isFetching, dataUpdatedAt, refetch } = useWebhook(id);
  const invalidate = useInvalidateWebhooks();

  const [draft, setDraft] = useState<WebhookDraft | null>(null);
  const initialRef = useRef<string>('');
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!webhook) return;
    if (initializedFor.current === webhook.id) return;
    initializedFor.current = webhook.id;
    const next = toDraft(webhook);
    setDraft(next);
    initialRef.current = serializeDraft(next);
  }, [webhook]);

  const dirty = draft !== null && serializeDraft(draft) !== initialRef.current;
  useDirtySource(dirty, 'You have unsaved changes here. Close anyway?');

  const typedName = draft?.name.trim() ?? '';
  const displayName = typedName !== '' ? typedName : (webhook?.name ?? 'Notification');
  useEffect(() => {
    ctx.setTitle(displayName);
  }, [ctx, displayName]);

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <PaneLoadError
          title="Could not load this"
          description="This is a problem reaching the server. The notification itself is unaffected."
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }

  if (!isLoading && !webhook) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <PaneLoadError
          reason="missing"
          title="This no longer exists"
          description="It looks like it was deleted. You can close this and set up a new one if you need it."
          onRetry={() => {
            ctx.close();
          }}
        />
      </div>
    );
  }

  if (isLoading || !webhook || !draft) return <PaneWaiting />;

  return (
    <ManageBody
      ctx={ctx}
      id={id}
      webhook={webhook}
      draft={draft}
      dirty={dirty}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      onChange={(patch) => {
        setDraft((current) => (current ? { ...current, ...patch } : current));
      }}
      onRefresh={() => {
        void refetch();
        invalidate();
      }}
      onSaved={(saved) => {
        const next = toDraft(saved);
        setDraft(next);
        initialRef.current = serializeDraft(next);
      }}
    />
  );
}

function toDraft(row: WebhookSubscription): WebhookDraft {
  return {
    name: row.name,
    url: row.url,
    events: new Set(row.events),
    active: row.active,
  };
}
