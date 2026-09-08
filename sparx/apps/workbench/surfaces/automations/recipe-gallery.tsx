'use client';

// The Recipe Gallery — the friendly, goal-organised face of the ~45 automations
// sparx pre-installs for every tenant.
//
// Those same automations already appear in the automations LIST as rows you can
// filter to "Set up by sparx". That view is for someone managing rules. THIS view
// is for a business owner who does not think in rules at all: it groups the shipped
// automations by what they ACHIEVE — "Get paid on time", "Recover lost sales" —
// gives each a plain-English name and a one-line description, and puts one big
// obvious ON/OFF switch on it. Nothing here creates an automation; it only
// presents and toggles the ones that already exist, and "Customize" hands off to
// the real editor for anyone who wants to change how one works.
//
// The join is: read the system automations, look each up in the recipe catalog by
// its exact name, and drop any the catalog has not named yet into a "More" group
// with its own server-set description — so a newly-seeded automation is never
// invisible here, it just lands in More until someone writes it a recipe line.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  SearchInput,
  Select,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Settings2, Sparkles } from 'lucide-react';
import { RefreshButton } from '../../components/refresh-button';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ModuleScope, type WorkbenchModule } from '../../components/module-scope';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  automationErrorMessage,
  useAutomations,
  useSetAutomationStatus,
  type Automation,
} from './automations-data';
import { automationState, parseActions } from './automations-presentation';
import { deriveModules } from './automations-catalog';
import {
  GOAL_GROUPS,
  goalGroup,
  recipeMetaFor,
  type GoalKey,
  type RecipeMeta,
} from './recipes-catalog';

const COLUMN = 'mx-auto flex w-full max-w-6xl flex-col gap-5 @lg:gap-6';

/** on = active or errored (an errored rule is still switched on — the badge is
 *  what flags that something went wrong); off = paused or draft. */
function isOn(status: Automation['status']): boolean {
  return status === 'active' || status === 'error';
}

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** The presentation for an automation with no curated recipe: its own name and
 *  server-set description, its module derived from what it actually touches, and
 *  the "More" goal. Keeps a freshly-seeded automation visible and honest. */
function fallbackMeta(automation: Automation): RecipeMeta {
  const modules = deriveModules(
    { triggerType: automation.triggerType, triggerConfig: automation.triggerConfig },
    parseActions(automation.actions)
  );
  return {
    name: automation.name,
    goal: 'more',
    title: automation.name,
    blurb: automation.description ?? 'An automation sparx set up for you.',
    icon: goalGroup('more').icon,
    module: (modules[0] as WorkbenchModule | undefined) ?? 'automations',
  };
}

interface Joined {
  automation: Automation;
  meta: RecipeMeta;
}

/** One recipe card: the friendly name + one-liner, a state badge, a big ON/OFF
 *  switch, and a "Customize" hand-off to the editor. Owns its own status mutation
 *  (one per automation id), so the hook is called exactly once per rendered card. */
function RecipeCard({
  automation,
  meta,
  onCustomize,
}: {
  automation: Automation;
  meta: RecipeMeta;
  onCustomize: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const toast = useToast();
  const setStatus = useSetAutomationStatus(automation.id);
  const state = automationState(automation.status);
  const on = isOn(automation.status);
  const Icon = meta.icon;

  const toggle = (next: boolean) => {
    setStatus.mutate(next ? 'active' : 'paused', {
      onSuccess: () => {
        toast.add({
          title: next ? `${meta.title} is on` : `${meta.title} is off`,
          description: next
            ? 'It will run automatically from now on.'
            : 'It is switched off and will not run until you turn it back on.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: next ? `Could not turn on ${meta.title}` : `Could not turn off ${meta.title}`,
          description: automationErrorMessage(error, 'Nothing was changed. Try again in a moment.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <ModuleScope module={meta.module} className="h-full">
      <Card className="border-module h-full border">
        <CardBody className="flex h-full flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <span className="bg-module text-module-content flex size-10 shrink-0 items-center justify-center rounded-lg">
              <Icon className="size-5" strokeWidth={2} aria-hidden />
            </span>
            {automation.locked ? (
              <div className="flex items-center gap-2">
                <span className="text-sm">Always on</span>
                <Switch
                  color="module"
                  checked
                  disabled
                  aria-label={`${meta.title} is always on — sparx manages this and it cannot be turned off`}
                />
              </div>
            ) : (
              <Switch
                color="module"
                checked={on}
                disabled={setStatus.isPending}
                aria-label={on ? `Turn off ${meta.title}` : `Turn on ${meta.title}`}
                onCheckedChange={toggle}
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-base font-semibold">{meta.title}</h3>
            <Text>{meta.blurb}</Text>
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <Badge color={state.tone} variant="soft">
              {state.label}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              color="module"
              title="Customize this automation — hold Shift to open alongside, Alt for a new window"
              onClick={onCustomize}
            >
              <Settings2 className="size-4" aria-hidden />
              Customize
            </Button>
          </div>
        </CardBody>
      </Card>
    </ModuleScope>
  );
}

export function RecipeGallerySurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useAutomations({
    status: 'all',
    origin: 'system',
  });

  const needle = search.trim().toLowerCase();

  const joined = useMemo<Joined[]>(() => {
    return (data ?? []).map((automation) => ({
      automation,
      meta: recipeMetaFor(automation.name) ?? fallbackMeta(automation),
    }));
  }, [data]);

  const filtered = useMemo(() => {
    return joined.filter(({ automation, meta }) => {
      if (state === 'on' && !isOn(automation.status)) return false;
      if (state === 'off' && isOn(automation.status)) return false;
      if (state === 'error' && automation.status !== 'error') return false;
      if (!needle) return true;
      return (
        meta.title.toLowerCase().includes(needle) ||
        meta.blurb.toLowerCase().includes(needle) ||
        automation.name.toLowerCase().includes(needle)
      );
    });
  }, [joined, needle, state]);

  // Group the visible recipes by goal, in the catalog's goal order, dropping any
  // group with nothing to show.
  const grouped = useMemo(() => {
    const byGoal = new Map<GoalKey, Joined[]>();
    for (const entry of filtered) {
      const list = byGoal.get(entry.meta.goal) ?? [];
      list.push(entry);
      byGoal.set(entry.meta.goal, list);
    }
    return GOAL_GROUPS.map((group) => ({ group, items: byGoal.get(group.key) ?? [] })).filter(
      (section) => section.items.length > 0
    );
  }, [filtered]);

  const filtering = needle !== '' || state !== 'all';
  const onCount = joined.filter(({ automation }) => isOn(automation.status)).length;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Recipe library controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search recipes"
              placeholder="Search recipes…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        status={
          <p className="hidden shrink-0 text-sm whitespace-nowrap @xl:block">
            {joined.length > 0 ? `${String(onCount)} of ${String(joined.length)} on` : ''}
          </p>
        }
        controls={
          <>
            <div className="ml-auto hidden w-40 shrink-0 @md:block">
              <Select
                size="sm"
                aria-label="Show"
                value={state}
                items={{
                  all: 'All recipes',
                  on: 'On',
                  off: 'Off',
                  error: 'Needs attention',
                }}
                onValueChange={(next) => {
                  setState((next as string) || 'all');
                }}
              />
            </div>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto @md:ml-0"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Text>
            These are automations sparx has already set up for your business. Each one runs a job
            for you in the background — welcoming customers, chasing overdue invoices, following up
            on a sale. Flip one on to put it to work, and use “Customize” to change how it behaves.
          </Text>

          {isError ? (
            <EmptyState
              icon={<Sparkles className="size-6" aria-hidden />}
              title="Could not load your recipes"
              description="Something went wrong reaching the server. Whatever you have switched on is unaffected and still running — try again in a moment."
              actions={
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    void refetch();
                  }}
                >
                  Try again
                </Button>
              }
            />
          ) : isPending ? (
            <p className="text-sm" role="status">
              Loading recipes…
            </p>
          ) : grouped.length === 0 ? (
            filtering ? (
              <EmptyState
                icon={<Sparkles className="size-6" aria-hidden />}
                title="No recipes match that"
                description="Try a different word, or set the filter back to “All recipes” to see everything sparx set up for you."
                actions={
                  <Button
                    size="sm"
                    variant="soft"
                    color="module"
                    onClick={() => {
                      setSearch('');
                      setState('all');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<Sparkles className="size-6" aria-hidden />}
                title="No recipes yet"
                description="Recipes appear here as you switch on parts of sparx — turn on the Online store, Invoicing or Email and their ready-made automations show up ready to use."
              />
            )
          ) : (
            grouped.map(({ group, items }) => {
              const GroupIcon = goalGroup(group.key).icon;
              return (
                <section key={group.key} className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <GroupIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
                    <div className="flex flex-col gap-0.5">
                      <h2 className="text-lg font-semibold">{group.title}</h2>
                      <p className="text-base">{group.blurb}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-3">
                    {items.map(({ automation, meta }) => (
                      <RecipeCard
                        key={automation.id}
                        automation={automation}
                        meta={meta}
                        onCustomize={(event) => {
                          ctx.open(
                            'automations.detail',
                            { id: automation.id },
                            { target: targetFor(event) }
                          );
                        }}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
