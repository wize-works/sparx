'use client';

// One broadcast — write it, or open one to see how it did. Create and edit share
// the same shape, so this is a PANE in two states, never a create modal:
// `{ id: 'new' }` starts a new broadcast, `{ id }` opens an existing one.
//
// A broadcast is editable ONLY while it is a draft. The moment it is sent or
// scheduled it becomes read-only, so the pane has two faces: the COMPOSER (this
// file, plus the field groups it renders) and the REVIEW (broadcast-review).
//
// The audience owns a business, not a mailing platform. Nothing here says
// "segment", "builder email" or "verified domain" without saying what it means:
// "who it goes to", "what you're sending", "the address it comes from".

import { useEffect, useMemo, useRef, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import { Card, Text } from '@wizeworks/silicaui-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PANE_SHELL } from '../../components/pane-toolbar';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  useAudiences,
  useBroadcast,
  useDesignedEmails,
  useEmailSettings,
  useRecipientEstimate,
  type Broadcast,
} from './broadcasts-data';
import { senderDisplay } from './broadcasts-presentation';
import { BroadcastComposeBody } from './broadcast-compose-body';
import { BroadcastComposeToolbar } from './broadcast-compose-toolbar';
import { useBroadcastCommit } from './broadcast-compose-writes';
import { BroadcastReview } from './broadcast-review';
import { COLUMN, draftFrom, missingPieces, serialize, type Draft } from './broadcast-draft';
import { SaveFailure } from '@/components/save-failure';

/* ── The pane router ──────────────────────────────────────────────────────── */

export function BroadcastDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  if (id === 'new') return <BroadcastComposer ctx={ctx} />;
  return <LoadBroadcast ctx={ctx} id={id} />;
}

function LoadBroadcast({ ctx, id }: { ctx: SurfaceContext; id: string }) {
  const {
    data: broadcast,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useBroadcast(id);

  if (isError) {
    return (
      <div className={`${PANE_SHELL} p-2`}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            error={error}
            noun="broadcast"
            title="Could not load this broadcast"
            description="This is a problem reaching the server, or the broadcast no longer exists. Nothing has been changed."
            onRetry={() => {
              void refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (isPending || !broadcast) return <PaneWaiting />;

  // Only a draft is editable; everything past that is read-only.
  if (broadcast.status === 'draft') return <BroadcastComposer ctx={ctx} broadcast={broadcast} />;
  return (
    <BroadcastReview
      ctx={ctx}
      broadcast={broadcast}
      isFetching={isFetching}
      updatedAt={dataUpdatedAt}
      onRefresh={() => {
        void refetch();
      }}
    />
  );
}

/* ── The composer (new draft, or editing a draft) ─────────────────────────── */

function BroadcastComposer({ ctx, broadcast }: { ctx: SurfaceContext; broadcast?: Broadcast }) {
  const audiences = useAudiences();
  const designed = useDesignedEmails();
  const settings = useEmailSettings();

  const [draft, setDraft] = useState<Draft>(() => draftFrom(broadcast));
  const [baseline, setBaseline] = useState<string>(() => serialize(draftFrom(broadcast)));
  // The id becomes real after the first save of a new broadcast — tracked so a
  // retry after a failed send patches the created draft rather than making a
  // second one.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [timing, setTiming] = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const committing = useRef(false);

  const currentId = broadcast?.id ?? createdId;

  useEffect(() => {
    ctx.setTitle(broadcast ? broadcast.name : 'New broadcast');
  }, [ctx, broadcast]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty = serialize(draft) !== baseline;
  useDirtySource(
    dirty && !committing.current,
    'This broadcast has changes you haven’t saved. Close it anyway?'
  );

  const estimate = useRecipientEstimate(draft.segmentId);
  const recipientCount = draft.segmentId ? estimate.data?.count : undefined;

  const chosenEmail = useMemo(
    () => designed.data?.find((email) => email.id === draft.builderEmailId),
    [designed.data, draft.builderEmailId]
  );
  const emailUnpublished = chosenEmail != null && !chosenEmail.published;

  // Enough to keep as a draft: the two things the server insists a broadcast has.
  const canSave = draft.name.trim() !== '' && draft.subject.trim() !== '';

  const missing = missingPieces({ draft, emailUnpublished, recipientCount });
  const ready = missing.length === 0 && recipientCount !== undefined && recipientCount > 0;

  const scheduleValid =
    timing === 'now' || (scheduledAt !== '' && new Date(scheduledAt) > new Date());

  const commit = useBroadcastCommit({
    ctx,
    draft,
    currentId,
    onCreated: setCreatedId,
    onBaseline: setBaseline,
    committing,
    senderLine: senderDisplay(settings.data),
    recipientCount,
    scheduledAt,
  });

  return (
    <div className={PANE_SHELL}>
      <BroadcastComposeToolbar
        commit={commit}
        lists={{
          isFetching: audiences.isFetching || designed.isFetching || settings.isFetching,
          updatedAt: audiences.data ? audiences.dataUpdatedAt : undefined,
          refresh: () => {
            void audiences.refetch();
            void designed.refetch();
            void settings.refetch();
          },
        }}
        recipientCount={recipientCount}
        canSave={canSave}
        ready={ready}
        dirty={dirty}
        saved={currentId !== null}
        timing={timing}
        scheduleValid={scheduleValid}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {broadcast ? null : (
            <Text>
              One email to a whole audience at once. Choose who it goes to and what it says, then
              send it now or pick a time.
            </Text>
          )}

          <SaveFailure title="That didn’t go through" message={commit.serverError} />

          <BroadcastComposeBody
            ctx={ctx}
            draft={draft}
            set={set}
            audiences={{
              items: audiences.data ?? [],
              isError: audiences.isError,
              isSuccess: audiences.isSuccess,
            }}
            designed={{
              items: designed.data ?? [],
              isError: designed.isError,
              isSuccess: designed.isSuccess,
            }}
            settings={settings.data}
            settingsPending={settings.isPending}
            recipientCount={recipientCount}
            estimatePending={estimate.isPending}
            emailUnpublished={emailUnpublished}
            missing={missing}
            timing={timing}
            setTiming={setTiming}
            scheduledAt={scheduledAt}
            setScheduledAt={setScheduledAt}
            scheduleValid={scheduleValid}
            savedId={currentId}
            dirty={dirty}
          />
        </div>
      </div>
    </div>
  );
}
