'use client';

// ONE SERVICE — set it up, change it, switch it off, or remove it.
//
// Create and edit are the SAME surface. A new service and an existing one are the
// same object at two ages, and the form is identical either way — so this is one
// pane in two states: `{id:'new'}` renders a blank draft, `{id}` renders the same
// fields hydrated. Splitting them is how a field ends up owned by two components.
//
// Not EditorLayout: there is no running summary to put beside the fields, so a
// summary rail would float half-empty. One centred, capped column instead.
//
// This file owns the SHAPE. The draft and its payload are service-draft; what the
// form knows and does is service-editor-state; the tail (booking window, options,
// remove) is service-options (RULE #0.5).

import { PaneWaiting } from '../../components/pane-waiting';
import { PaneLoadError } from '../../components/pane-load-error';
import { Badge, Button, Card, Text } from '@wizeworks/silicaui-react';
import { faFloppyDisk } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { ServiceRequirements } from './service-requirements';
import { ServiceBasics } from './service-basics';
import { BookingWindow, ServiceOptions } from './service-options';
import { BLANK, draftFrom, type Draft } from './service-draft';
import { useServiceEditor } from './service-editor-state';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  bookingTypeLabel,
  isNotFound,
  serviceState,
  usePolicies,
  useService,
  type SchedulingService,
} from './setup-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/* ── The shared form ────────────────────────────────────────────────────── */

function ServiceEditor({
  ctx,
  id,
  initial,
  existing,
  isFetching = false,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  id: string;
  initial: Draft;
  existing: SchedulingService | null;
  /** Absent on a brand-new service — there is nothing loaded to re-read. */
  isFetching?: boolean;
  updatedAt?: number;
  onRefresh?: () => void;
}) {
  const isNew = id === 'new';
  const form = useServiceEditor(ctx, id, initial, existing);
  const policies = usePolicies({ take: 250, skip: 0 });
  const state = existing ? serviceState(existing) : null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label={isNew ? 'New service actions' : 'Service actions'}
        refresh={
          onRefresh ? (
            <RefreshButton isFetching={isFetching} updatedAt={updatedAt} onRefresh={onRefresh} />
          ) : undefined
        }
        status={
          state ? (
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
          ) : null
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            disabled={!form.canSave}
            loading={form.busy}
            onClick={form.submit}
          >
            <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
            {isNew ? 'Create service' : 'Save'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {existing ? (
            <Text className="text-sm">{bookingTypeLabel(existing.bookingType)}</Text>
          ) : null}

          <SaveFailure title="Could not save this service" message={form.saveError} />

          <ServiceBasics
            isNew={isNew}
            draft={form.draft}
            policies={policies}
            priceProblem={form.priceProblem}
            onSet={form.set}
          />

          <ServiceRequirements
            requirements={form.draft.requirements}
            strategy={form.draft.assignmentStrategy}
            onChangeStrategy={(strategy) => {
              form.set('assignmentStrategy', strategy);
            }}
            onChange={(requirements) => {
              form.set('requirements', requirements);
            }}
          />

          <BookingWindow draft={form.draft} onSet={form.set} />

          <ServiceOptions
            draft={form.draft}
            onSet={form.set}
            canRemove={existing !== null}
            removing={form.removing}
            onRemove={form.onRemove}
          />
        </div>
      </div>
    </div>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

export function ServiceDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';
  const service = useService(id);

  if (isNew) {
    return <ServiceEditor ctx={ctx} id="new" initial={BLANK} existing={null} />;
  }

  if (service.isError) {
    const gone = isNotFound(service.error);
    return (
      <div className={PANE_SHELL}>
        <Card className="min-h-0 flex-1 items-center justify-center">
          <PaneLoadError
            reason={gone ? 'missing' : 'unreachable'}
            title={gone ? 'This service has been removed' : 'Could not load this service'}
            description={
              gone
                ? 'Bookings already made against it are unaffected, and you can put it back from your services list.'
                : 'This is a problem reaching the server. Nothing about the service has changed.'
            }
            onRetry={() => {
              void service.refetch();
            }}
          />
        </Card>
      </div>
    );
  }

  if (service.isPending || !service.data) {
    return (
      <div className={PANE_SHELL}>
        <PaneWaiting />
      </div>
    );
  }

  return (
    <ServiceEditor
      key={service.data.id}
      ctx={ctx}
      id={id}
      initial={draftFrom(service.data)}
      existing={service.data}
      isFetching={service.isFetching}
      updatedAt={service.dataUpdatedAt}
      onRefresh={() => {
        void service.refetch();
      }}
    />
  );
}
