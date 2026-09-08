'use client';

// Every outside service this business can connect — the one place to look.
//
// WHY THIS IS A GRID AND NOT GROUPED LISTS. The first version wrapped each category
// in a bordered card holding full-width rows, which at nine categories and thirty-nine
// services read as nine stacked tables: every row the same shape, a sentence wide,
// thirty-nine of them down one column. Card chrome around a list says "these rows form
// a unit you compare within" — the opposite of the truth here, where the useful
// comparison is between SERVICES, and the category is just how you narrow to them.
//
// So the category stopped being a container and became a FACET. The chrome moved from
// the group to the item: each service is a tile you can take in at a glance, laid out
// in a responsive grid, and the categories are chips you filter by. Thirty-nine
// services fit in ten rows instead of thirty-nine, and the two questions a person
// actually arrives with — "what have I connected?" and "what can I add?" — are a
// filter each rather than a scroll.
//
// COLOR CARRIES THE CATEGORY. Each group is wrapped in its own ModuleScope, so payments
// and shipping read commerce, social reads social, suppliers read dropship and AI reads
// AI (docs/23 color-follows-functionality). The chassis stays neutral; the tile's icon
// and its connect affordance take the hue. That is what keeps a one-shelf panel
// scannable — the color tells you which part of the business you are in before you
// read the heading.
//
// Filtering is silica's own `Filter`/`ToggleGroup`, not hand-rolled chips (RULE #1).

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  ClickableCard,
  EmptyState,
  Filter,
  FilterItem,
  Heading,
  SearchInput,
  Skeleton,
  Text,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { Lock, Plug, Plus } from 'lucide-react';
import { RefreshButton } from '../../components/refresh-button';
import { ModuleScope, type WorkbenchModule } from '../../components/module-scope';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { categoryIcon } from './kind-icon';
import {
  connectionState,
  isConnectable,
  lockedReason,
  useIntegrations,
  type Integration,
  type IntegrationCategory,
  type IntegrationCategoryView,
} from './data';
import { RowOpenHint } from '../../components/row-open-hint';
import { PaneLoadError } from '../../components/pane-load-error';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** Which module's hue a category wears. Payments, shipping, tax and marketplaces are
 *  all selling concerns even when a tenant reaches them through invoicing. */
const CATEGORY_MODULE: Record<IntegrationCategory, WorkbenchModule> = {
  payments: 'commerce',
  shipping: 'commerce',
  tax: 'commerce',
  sales_channels: 'commerce',
  social: 'social',
  dropship: 'dropship',
  ai: 'ai',
};

/**
 * Where a category is actually managed.
 *
 * This panel is the CATALOG, not five reimplemented connect flows — each category's own
 * surface already knows how to do an OAuth handshake, a key form or a hosted
 * onboarding, and duplicating that here is how you end up with two ways to connect one
 * thing that disagree. So this routes.
 */
const CATEGORY_SURFACE: Record<IntegrationCategory, string> = {
  payments: 'commerce.providers',
  sales_channels: 'commerce.channels.list',
  social: 'social.connections',
  dropship: 'dropship.suppliers.list',
  ai: 'platform.settings.ai',
  shipping: 'platform.settings.integration',
  tax: 'platform.settings.integration',
};

/** The `ProviderKind` behind a category, for the two shelves that provider bundles
 *  serve. Everything else connects through its own module's flow and has no kind. */
const CATEGORY_PROVIDER_KIND: Partial<Record<IntegrationCategory, string>> = {
  shipping: 'shipping',
  tax: 'tax',
};

/** The two questions people arrive with, as one control. */
type StatusFilter = 'all' | 'connected' | 'available' | 'soon';

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All',
  connected: 'Connected',
  available: 'Available',
  soon: 'Coming soon',
};

function matchesStatus(integration: Integration, status: StatusFilter): boolean {
  switch (status) {
    case 'connected':
      return integration.connection !== null;
    case 'available':
      return integration.connection === null && isConnectable(integration);
    case 'soon':
      return !isConnectable(integration);
    case 'all':
      return true;
  }
}

/** One service. The whole tile is the target — identity, what it does, where it stands. */
function IntegrationTile({
  integration,
  onOpen,
}: {
  integration: Integration;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const { connection } = integration;
  const connectable = isConnectable(integration);
  const Icon = categoryIcon(integration.category);

  return (
    <ClickableCard
      className="bg-base-100 flex h-full flex-col items-start gap-2 p-3 text-left"
      onClick={onOpen}
    >
      <div className="flex w-full min-w-0 items-start gap-2">
        <span className="bg-module text-module-content flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{integration.name}</span>
          <span className="truncate text-sm">by {integration.vendor}</span>
        </span>
      </div>

      {/* Always the blurb, never the unavailable reason in its place. Swapping them cost
          the tile its only description — ten channels each explaining that sparx was
          finishing a partner approval, and not one saying what the channel DOES. The
          badge carries the state; the reason rides on it as a tooltip. */}
      <Text className="line-clamp-2 flex-1 text-sm">{integration.blurb}</Text>

      <div className="flex w-full flex-wrap items-center gap-1.5">
        {connection ? (
          <Badge color={connectionState(connection).tone} variant="soft" size="sm">
            {connectionState(connection).label}
          </Badge>
        ) : connectable ? (
          <span className="text-module inline-flex items-center gap-1 text-sm font-medium">
            <Plus className="size-4" aria-hidden />
            Connect
          </span>
        ) : (
          // `soft` like every other state badge here. State is ONE axis, so its badges
          // vary by COLOR and never by variant — an outline chip beside a soft one
          // reads as a different kind of thing rather than a different state, which is
          // the wrong distinction to draw between "Connected" and "Coming soon".
          // Neutral is earned: an unbuilt integration is a genuinely untyped state.
          //
          // The reason rides in a Tooltip rather than a `title` attribute — it is real
          // copy a person may need, and silica's tooltip is keyboard-reachable and
          // styled with everything else, where the native one is neither.
          <Tooltip content={integration.unavailableReason ?? 'Not available yet.'}>
            <Badge color="neutral" variant="soft" size="sm">
              {integration.availability === 'needs_platform_setup' ? 'Almost ready' : 'Coming soon'}
            </Badge>
          </Tooltip>
        )}
        {integration.recommended ? (
          <Badge color="module" variant="soft" size="sm">
            Recommended
          </Badge>
        ) : null}
        {/* A contributor's integration says so plainly — a tenant is trusting somebody
            other than sparx with their data, and that is theirs to know. */}
        {integration.publisher !== 'sparx' ? (
          <Badge color="info" variant="soft" size="sm">
            Community
          </Badge>
        ) : null}
      </div>
    </ClickableCard>
  );
}

/** One category — a heading and its services. No card around the group: the tiles are
 *  the cards, and wrapping them in another one is what made this read as a table. */
function CategoryGroup({
  view,
  integrations,
  onOpen,
}: {
  view: IntegrationCategoryView;
  integrations: Integration[];
  onOpen: (integration: Integration, event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  return (
    <ModuleScope module={CATEGORY_MODULE[view.category]} className="flex flex-col gap-2">
      {/* The count sits NEXT TO the heading, not pushed to the far edge with `ml-auto`.
          It counts what the heading names, and across a wide pane that gap left it
          floating against the grid's right edge reading as though it belonged to
          whatever tile happened to be under it. */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Heading level={2} className="text-base font-semibold">
          {view.label}
        </Heading>
        {view.connectedCount > 0 ? (
          <Badge color="success" variant="soft" size="sm">
            {view.connectedCount === 1 ? '1 connected' : `${String(view.connectedCount)} connected`}
          </Badge>
        ) : null}
        <Text className="text-sm">{view.hint}</Text>
      </div>

      {view.unlocked ? (
        <div className="grid gap-2 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4">
          {integrations.map((integration) => (
            <IntegrationTile
              key={`${integration.category}:${integration.slug}`}
              integration={integration}
              onOpen={(event) => {
                onOpen(integration, event);
              }}
            />
          ))}
        </div>
      ) : (
        // A locked category still shows its heading and what it is for. Hiding it would
        // mean a tenant can only discover a capability they already know about, which is
        // the failure this panel exists to fix.
        <div className="border-base-300 rounded-box flex items-center gap-2 border border-dashed px-3 py-2">
          <Lock className="size-4 shrink-0" aria-hidden />
          <Text className="text-sm">{lockedReason(view)}</Text>
        </div>
      )}
    </ModuleScope>
  );
}

export function IntegrationsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const catalog = useIntegrations();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<string | undefined>(undefined);
  const needle = search.trim().toLowerCase();

  // Every category the tenant could see, with its services narrowed by all three
  // controls. A category the filters empty out drops away entirely — an empty heading
  // is noise, and the chip row still says the category exists.
  const groups = useMemo(() => {
    const matchesText = (integration: Integration) =>
      !needle ||
      integration.name.toLowerCase().includes(needle) ||
      integration.vendor.toLowerCase().includes(needle) ||
      integration.blurb.toLowerCase().includes(needle);

    return (catalog.data?.categories ?? [])
      .filter((view) => !category || view.category === category)
      .map((view) => ({
        view,
        integrations: view.integrations
          .filter((i) => matchesText(i) && matchesStatus(i, status))
          // Connected first — what you already run is what you came back for.
          .sort((a, b) => Number(b.connection !== null) - Number(a.connection !== null)),
      }))
      .filter(({ view, integrations }) => integrations.length > 0 || !view.unlocked);
  }, [catalog.data, needle, status, category]);

  // Chip counts come from the UNFILTERED catalog, so a chip always says how much is
  // behind it rather than how much survived the filter you already applied.
  const categoryCounts = useMemo(
    () =>
      (catalog.data?.categories ?? []).map((view) => ({
        category: view.category,
        label: view.label,
        count: view.integrations.length,
      })),
    [catalog.data]
  );

  const openIntegration = (
    integration: Integration,
    event: { shiftKey: boolean; altKey: boolean }
  ) => {
    ctx.open(
      CATEGORY_SURFACE[integration.category],
      // The provider surfaces take a slug (and an installation id when there is one);
      // the category-level surfaces ignore both and open their own list.
      //
      // `kind` is passed EXPLICITLY rather than left to the detail pane, which
      // otherwise falls back to `metadata.kinds[0]`. A provider bundle may implement
      // several kinds by design, so that fallback installs the first one the package
      // happens to list — which is silently wrong for anything opened from a shelf that
      // is not first. Every bundle is single-kind today; this is one line that keeps
      // the day one of them is not from being a bug nobody can see.
      {
        slug: integration.slug,
        ...(integration.connection?.id ? { id: integration.connection.id } : {}),
        ...(CATEGORY_PROVIDER_KIND[integration.category]
          ? { kind: CATEGORY_PROVIDER_KIND[integration.category] }
          : {}),
      },
      { target: targetFor(event) }
    );
  };

  if (catalog.isError) {
    return (
      <PaneLoadError
        icon={<Plug className="size-6" aria-hidden />}
        title="Could not load your integrations"
        description="This is a problem reaching the server. Your existing connections are unaffected and still working."
        onRetry={() => {
          void catalog.refetch();
        }}
      />
    );
  }

  const connectedCount = catalog.data?.connectedCount ?? 0;
  const filtered = needle !== '' || status !== 'all' || category !== undefined;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Integration list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search integrations"
              placeholder="Search services…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        status={
          <p className="ml-auto hidden shrink-0 text-sm whitespace-nowrap @2xl:block">
            {connectedCount === 0
              ? 'None connected yet'
              : connectedCount === 1
                ? '1 connected'
                : `${String(connectedCount)} connected`}
          </p>
        }
        controls={
          <>
            {/* A segmented control, not chips: these four are MODES of one question and
            exactly one is always true, which is what a segmented control means. */}
            <ToggleGroup
              size="sm"
              color="module"
              value={[status]}
              onValueChange={(next: unknown[]) => {
                setStatus((next[0] as StatusFilter | undefined) ?? 'all');
              }}
              aria-label="Filter by connection state"
            >
              {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((value) => (
                <ToggleGroupItem key={value} value={value}>
                  {STATUS_LABEL[value]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={catalog.isFetching}
            updatedAt={catalog.data ? catalog.dataUpdatedAt : undefined}
            onRefresh={() => {
              void catalog.refetch();
            }}
          />
        }
      />

      {/* Category as a FACET rather than a container — silica's own Filter, which brings
          its own reset chip, so "back to everything" is always one click away. The row
          scrolls sideways instead of wrapping, so a narrow docked pane never pushes the
          grid down the screen. */}
      {categoryCounts.length > 0 ? (
        <div className="-mx-1 overflow-x-auto px-1">
          <Filter
            color="module"
            value={category}
            onValueChange={setCategory}
            resetLabel="Show every kind of service"
            className="w-max flex-nowrap"
          >
            {categoryCounts.map((entry) => (
              <FilterItem key={entry.category} value={entry.category}>
                {entry.label} ({entry.count})
              </FilterItem>
            ))}
          </Filter>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {catalog.isPending ? (
          // Skeleton tiles in the real grid, so the layout does not jump when the
          // catalog lands — a bare "Loading…" line reflows the whole pane on arrival.
          <div
            className="grid gap-2 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-4"
            role="status"
            aria-label="Loading integrations"
          >
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Plug className="size-6" aria-hidden />}
            title="Nothing matches those filters"
            description="Try a different search, or clear the filters to see everything you can connect."
            actions={
              filtered ? (
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    setSearch('');
                    setStatus('all');
                    setCategory(undefined);
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
            {groups.map(({ view, integrations }) => (
              <CategoryGroup
                key={view.category}
                view={view}
                integrations={integrations}
                onOpen={openIntegration}
              />
            ))}
          </div>
        )}
      </div>

      <RowOpenHint what="a service to connect or manage it" />
    </div>
  );
}
