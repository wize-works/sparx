'use client';

// PEOPLE & EQUIPMENT — whatever a booking uses up: a member of staff, a room, a
// bay, a machine. Two bookings can never claim the same one at the same time.
//
// A table, like every other list. A resource is an identity (its name and what
// kind of thing it is) plus its state. The list endpoint has no free-text search
// — resources are few, and you filter by KIND, not by typing — so the toolbar
// carries a kind picker and an "in use only" toggle, both SERVER filters, and no
// search box it cannot honour.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  NativeSelect,
  Table,
  ToggleGroup,
  ToggleGroupItem,
} from '@wizeworks/silicaui-react';
import { EyeOff, Plus, Users } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  RESOURCE_KINDS,
  resourceKindLabel,
  resourceState,
  useResources,
  type ResourceKind,
  type SchedulingResource,
} from './setup-data';
import { RowOpenHint } from '../../components/row-open-hint';

const DETAIL_KEY = 'scheduling.resources.detail';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** The capacity note that makes sense for this KIND — a pooled resource holds
 *  several bookings at once, a table seats a party, staff hold one at a time. */
function capacityNote(resource: SchedulingResource): string | null {
  if (resource.kind === 'table') {
    if (resource.capacityMin && resource.capacityMax) {
      return `Seats ${String(resource.capacityMin)}–${String(resource.capacityMax)}`;
    }
    if (resource.capacityMax) return `Seats up to ${String(resource.capacityMax)}`;
  }
  if (!resource.exclusive && resource.capacity > 1) {
    return `${String(resource.capacity)} at once`;
  }
  return null;
}

export function ResourcesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [kind, setKind] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);

  const { data, isPending, isFetching, dataUpdatedAt, isError, refetch } = useResources({
    ...(kind ? { kind: kind as ResourceKind } : {}),
    activeOnly,
  });

  const rows = data?.items ?? [];
  const kindLabel = kind ? resourceKindLabel(kind) : null;
  const narrowed = kind !== '';

  const openNew = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(DETAIL_KEY, { id: 'new' }, { target: targetFor(event) });
  };

  const open = (resource: SchedulingResource, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(DETAIL_KEY, { id: resource.id }, { target: targetFor(event) });
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<Users className="size-6" aria-hidden />}
          title="Could not load your people & equipment"
          description="This is a problem reaching the server. Nothing is affected — the list just could not be read just now."
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
      );
    }

    if (isPending) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      );
    }

    if (rows.length === 0) {
      return (
        <ListEmptyState
          filtered={narrowed}
          noResults={{
            icon: <Users className="size-6" aria-hidden />,
            title: 'Nothing matches that',
            description: `You are only seeing “${kindLabel ?? ''}” — switch to every kind to see the rest.`,
          }}
          firstRun={{
            title: 'Nothing set up yet',
            description:
              'Add the people and things a booking uses up — your staff, your rooms, your equipment. Once they exist, you can set the hours each one is free.',
            actions: (
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  openNew({ shiftKey: false, altKey: false });
                }}
              >
                <Plus className="size-4" aria-hidden />
                Add one
              </Button>
            ),
          }}
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Name</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Kind</th>
            <th className="hidden whitespace-nowrap @xl:table-cell">Holds</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((resource) => {
            const state = resourceState(resource);
            const holds = capacityNote(resource);
            return (
              <tr
                key={resource.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  open(resource, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  open(resource, event);
                }}
              >
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{resource.name}</span>
                    <span className="truncate text-sm @lg:hidden">
                      {resourceKindLabel(resource.kind)}
                      {holds ? ` · ${holds}` : ''}
                    </span>
                  </span>
                </td>
                <td className="hidden whitespace-nowrap @lg:table-cell">
                  {resourceKindLabel(resource.kind)}
                </td>
                <td className="hidden whitespace-nowrap @xl:table-cell">{holds ?? '—'}</td>
                <td>
                  <Badge color={state.tone} variant="soft" size="sm">
                    {state.label}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="People & equipment list controls"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="Add one — hold Shift to open alongside, Alt for a new window"
            onClick={openNew}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @lg:inline">Add one</span>
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-52 shrink"
              aria-label="Show only one kind"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value);
              }}
            >
              <option value="">Every kind</option>
              {RESOURCE_KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <ToggleGroup
              size="sm"
              color="module"
              className="shrink-0"
              value={activeOnly ? ['active'] : []}
              onValueChange={(next: unknown[]) => {
                setActiveOnly(next.includes('active'));
              }}
            >
              <ToggleGroupItem
                value="active"
                aria-label="Hide switched-off ones"
                title="Hide switched-off ones"
              >
                <EyeOff className="size-4" aria-hidden />
                <span className="hidden @2xl:inline">In use only</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <Card className="mx-auto min-h-0 w-full max-w-4xl flex-1 overflow-y-auto">{body()}</Card>

      {rows.length > 0 ? <RowOpenHint /> : null}
    </div>
  );
}
