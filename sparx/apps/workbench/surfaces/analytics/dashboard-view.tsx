'use client';

// A dashboard, on screen.
//
// One generic pane renders every dashboard: it fetches the config (its tiles),
// runs the ONE batch query for the whole screen, and lays the tiles out. Nothing
// about this component knows what "Traffic" is — swap the id and it renders any
// dashboard, which is what makes user-authored dashboards a later addition rather
// than a rewrite (docs/129 §9).
//
// The layout is a dense control panel, not a column of cards: a KPI strip across
// the top (every `kpi` tile), then a body grid where the hero chart runs full
// width and the panels sit beneath it. The pane wears the OWNING module's hue via
// a nested ModuleScope (docs/23 color-follows-functionality) — a Traffic
// dashboard draws in builder indigo.

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  EmptyState,
  Heading,
  Select,
  Skeleton,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from '@wizeworks/silicaui-react';
import { LayoutDashboard, ServerCrash } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import {
  ModuleScope,
  WORKBENCH_MODULES,
  type WorkbenchModule,
} from '../../components/module-scope';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { KpiCard, Tile, targetFor, spanClass } from './tiles';
import {
  analyticsErrorMessage,
  isModuleDisabled,
  presetRange,
  RANGE_LABEL,
  tileKey,
  useDashboard,
  useDashboardQuery,
  type Grain,
  type MetricResult,
  type RangePreset,
} from './data';

/** Narrow the server's module string to a known workbench hue, falling back to
 *  the neutral platform hue for a module the rail doesn't paint. */
function asModule(module: string): WorkbenchModule {
  return (WORKBENCH_MODULES as readonly string[]).includes(module)
    ? (module as WorkbenchModule)
    : 'platform';
}

const GRAINS: { value: Grain; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

/** The loading scaffold before the config's tile list is known — a KPI row and a
 *  hero-sized block, so the first paint is the shape of the answer, not a spinner. */
function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @4xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

export function DashboardViewSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const [preset, setPreset] = useState<RangePreset>('30');
  const [grain, setGrain] = useState<Grain>('day');
  const range = useMemo(() => {
    const base = presetRange(preset);
    return { from: base.from, to: base.to, grain };
  }, [preset, grain]);

  const dashboard = useDashboard(id);
  const query = useDashboardQuery(dashboard.data, range);

  // Once the config loads, name the tab for the dashboard rather than the id.
  const title = dashboard.data?.title;
  useEffect(() => {
    if (title) ctx.setTitle(title);
  }, [ctx, title]);

  const resultByKey = useMemo(() => {
    const map = new Map<string, MetricResult>();
    for (const result of query.data?.results ?? []) map.set(result.key, result);
    return map;
  }, [query.data]);

  const refetch = () => {
    void dashboard.refetch();
    void query.refetch();
  };

  if (isModuleDisabled(dashboard.error)) {
    return (
      <div className={PANE_SHELL}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            icon={<LayoutDashboard className="size-6" aria-hidden />}
            title="This dashboard isn’t switched on"
            description="It comes with a part of sparx that isn’t active for this account."
          />
        </div>
      </div>
    );
  }

  if (dashboard.isError) {
    return (
      <div className={PANE_SHELL}>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <EmptyState
            icon={<ServerCrash className="size-6" aria-hidden />}
            title="Could not load this dashboard"
            description={analyticsErrorMessage(
              dashboard.error,
              'This is a problem reaching the server. Try again in a moment.'
            )}
            actions={
              <Button size="sm" color="module" onClick={refetch}>
                Try again
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const config = dashboard.data;
  const module = config ? asModule(config.module) : 'platform';

  // Preserve each tile's ORIGINAL index — the batch query keyed its result by it.
  const indexed = (config?.tiles ?? []).map((tile, index) => ({ tile, index }));
  const kpiTiles = indexed.filter((t) => t.tile.shape === 'kpi');
  const bodyTiles = indexed.filter((t) => t.tile.shape !== 'kpi');

  return (
    <ModuleScope module={module} className={PANE_SHELL}>
      <PaneToolbar
        label="Dashboard controls"
        controls={
          <>
            <LayoutDashboard className="size-4 shrink-0" aria-hidden />
            <Heading level={2} className="min-w-0 truncate text-base font-semibold">
              {config?.title ?? 'Dashboard'}
            </Heading>
          </>
        }
        refresh={
          <div className="ml-auto flex items-center gap-2">
            <ToggleGroup
              value={[grain]}
              aria-label="Group by"
              onValueChange={(value: string[]) => {
                const next = value[value.length - 1];
                if (next) setGrain(next as Grain);
              }}
            >
              {GRAINS.map((g) => (
                <ToggleGroupItem key={g.value} value={g.value}>
                  {g.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="w-36">
              <Select
                size="sm"
                color="module"
                aria-label="Time period"
                value={preset}
                items={[
                  { value: '7', label: RANGE_LABEL['7'] },
                  { value: '30', label: RANGE_LABEL['30'] },
                  { value: '90', label: RANGE_LABEL['90'] },
                ]}
                onValueChange={(next) => {
                  setPreset((next as RangePreset) ?? '30');
                }}
              />
            </div>
            <RefreshButton
              isFetching={dashboard.isFetching || query.isFetching}
              updatedAt={query.data ? query.dataUpdatedAt : undefined}
              onRefresh={refetch}
            />
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="@container mx-auto flex w-full max-w-[1600px] flex-col gap-4 p-4">
          {!config ? (
            <DashboardSkeleton />
          ) : (
            <>
              {config.description ? <Text className="text-sm">{config.description}</Text> : null}

              {kpiTiles.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @4xl:grid-cols-5">
                  {kpiTiles.map(({ tile, index }) => (
                    <KpiCard
                      key={tileKey(index)}
                      tile={tile}
                      result={resultByKey.get(tileKey(index))}
                    />
                  ))}
                </div>
              ) : null}

              {query.isError ? (
                <EmptyState
                  icon={<ServerCrash className="size-6" aria-hidden />}
                  title="Could not load the figures"
                  description={analyticsErrorMessage(
                    query.error,
                    'The dashboard is here, but its numbers could not be fetched. Try again in a moment.'
                  )}
                  actions={
                    <Button size="sm" color="module" onClick={refetch}>
                      Try again
                    </Button>
                  }
                />
              ) : bodyTiles.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-4">
                  {bodyTiles.map(({ tile, index }) => {
                    const drill = tile.drill;
                    const onDrill = drill
                      ? (
                          extra: Record<string, string>,
                          event: { shiftKey: boolean; altKey: boolean }
                        ) => {
                          ctx.open(
                            drill.surface,
                            { ...(drill.params ?? {}), ...extra },
                            { target: targetFor(event) }
                          );
                        }
                      : undefined;
                    return (
                      <div key={tileKey(index)} className={spanClass(tile.span)}>
                        <Tile
                          tile={tile}
                          result={resultByKey.get(tileKey(index))}
                          onDrill={onDrill}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </ModuleScope>
  );
}
