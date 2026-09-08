'use client';

// Campaigns — the module landing. Every named path to an outcome this business
// runs, and how each one is doing.
//
// ── WHY ROWS AND NOT TILES ─────────────────────────────────────────────────
//
// Social's list is a grid of picture tiles because a post IS a picture. A
// campaign has no image; what distinguishes one from another is its NAME, its
// state, and the shape of its ladder. A row gives the name the width it needs
// and puts the stages in a line where the narrowing is legible — which is the
// one thing that tells you at a glance which campaign to open.
//
// Each row carries a compact ladder rather than a single conversion figure,
// because "3%" tells you a campaign is bad and the ladder tells you WHERE it is
// bad, which is the actionable half.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Heading,
  SearchInput,
  Select,
  Text,
} from '@wizeworks/silicaui-react';
import { Plus, ServerCrash, Target } from 'lucide-react';
import { PANE_SHELL, PaneToolbar } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { RowOpenHint } from '../../components/row-open-hint';
import { useViewer } from '../../lib/api/shell-data';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  KIND_LABEL,
  canEditCampaigns,
  funnelErrorMessage,
  statusMeta,
  useFunnels,
  type Funnel,
  type FunnelStatus,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/**
 * The ladder as a strip of stage names, so a row shows the SHAPE of a campaign
 * without fetching its numbers.
 *
 * Deliberately no counts here. Each row's figures would be one request per row,
 * which turns opening the list into a dozen round trips to tell somebody what
 * they can read on the campaign itself. The strip answers "what does this
 * campaign track", which is the question a list is for.
 */
function StageStrip({ funnel }: { funnel: Funnel }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {funnel.stages.map((stage, index) => (
        <span key={stage.key} className="flex items-center gap-1">
          {index > 0 ? <span aria-hidden>›</span> : null}
          <Badge color={stage.kind === 'convert' ? 'module' : 'info'} variant="soft" size="sm">
            {stage.name}
          </Badge>
        </span>
      ))}
    </div>
  );
}

function CampaignRow({
  funnel,
  onOpen,
}: {
  funnel: Funnel;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const meta = statusMeta(funnel.status);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="border-base-300 bg-base-100 hover:border-module flex w-full cursor-pointer flex-col gap-2 rounded-lg border p-3 text-left transition-colors"
      >
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Heading level={3} className="text-base font-semibold">
            {funnel.name}
          </Heading>
          <Badge color={meta.tone} variant="soft" size="sm">
            {meta.label}
          </Badge>
          <div className="flex-1" />
          <Text className="text-sm">{KIND_LABEL[funnel.kind]}</Text>
        </div>

        {funnel.description ? <Text className="text-sm">{funnel.description}</Text> : null}

        <StageStrip funnel={funnel} />
      </button>
    </li>
  );
}

/** The one sentence a business owner needs before they build their first one. */
function FirstCampaign({ canEdit, onNew }: { canEdit: boolean; onNew: () => void }) {
  return (
    <EmptyState
      icon={<Target className="size-6" aria-hidden />}
      title="No campaigns yet"
      description="A campaign is a named path to an outcome: somebody finds your page, leaves their details, and eventually buys something or books you in. Set one up and you will be able to see how many people made it to each step, and where they stopped."
      actions={
        canEdit ? (
          <Button color="module" size="sm" onClick={onNew}>
            <Plus className="size-4" aria-hidden />
            New campaign
          </Button>
        ) : undefined
      }
    />
  );
}

export function CampaignsSurface({ ctx }: { ctx: SurfaceContext }) {
  const funnels = useFunnels();
  const viewer = useViewer();
  const canEdit = canEditCampaigns(viewer.data?.role);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<FunnelStatus | 'all'>('all');

  // `?? []` inline would mint a new array every render and re-run the filter with
  // it, so the fallback is memoised alongside the data it stands in for.
  const all = useMemo(() => funnels.data ?? [], [funnels.data]);
  const needle = search.trim().toLowerCase();
  const matches = useMemo(
    () =>
      all.filter(
        (f) =>
          (status === 'all' || f.status === status) &&
          (!needle || f.name.toLowerCase().includes(needle))
      ),
    [all, needle, status]
  );

  const openCampaign = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('funnels.campaign', { id }, { target: targetFor(event) });
  };

  if (funnels.isError) {
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          icon={<ServerCrash className="size-6" aria-hidden />}
          title="Could not load your campaigns"
          description={funnelErrorMessage(
            funnels.error,
            'This is a problem reaching the server. Nothing about your campaigns has changed.'
          )}
          onRetry={() => {
            void funnels.refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Campaign list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search campaigns"
              placeholder="Search campaigns…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        controls={
          <>
            <Select
              size="sm"
              aria-label="Filter by status"
              value={status}
              onValueChange={(value) => {
                setStatus(value as FunnelStatus | 'all');
              }}
              items={[
                { value: 'all', label: 'Every campaign' },
                { value: 'active', label: 'Running' },
                { value: 'draft', label: 'Drafts' },
                { value: 'paused', label: 'Paused' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            {canEdit ? (
              <Button
                color="module"
                size="sm"
                className="ml-auto shrink-0 whitespace-nowrap"
                title="Start a new campaign — hold Shift to open alongside, Alt for a new window"
                onClick={(event) => {
                  openCampaign('new', event);
                }}
              >
                <Plus className="size-4" aria-hidden />
                New campaign
              </Button>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className={canEdit ? undefined : 'ml-auto'}
            isFetching={funnels.isFetching}
            updatedAt={funnels.data ? funnels.dataUpdatedAt : undefined}
            onRefresh={() => {
              void funnels.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {funnels.isPending ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : all.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <FirstCampaign
              canEdit={canEdit}
              onNew={() => {
                openCampaign('new', { shiftKey: false, altKey: false });
              }}
            />
          </div>
        ) : matches.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              icon={<Target className="size-6" aria-hidden />}
              title="No campaigns match that"
              description="Try different words, or show every campaign again."
            />
          </div>
        ) : (
          <ul className="flex w-full flex-col gap-2 p-4">
            {matches.map((funnel) => (
              <CampaignRow
                key={funnel.id}
                funnel={funnel}
                onOpen={(event) => {
                  openCampaign(funnel.id, event);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <RowOpenHint what="a campaign to open it" />
    </div>
  );
}

export default CampaignsSurface;
