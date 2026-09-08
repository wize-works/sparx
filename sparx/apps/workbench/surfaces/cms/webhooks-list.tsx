'use client';

// The webhooks you have set up — where notifications are sent, and what they're
// sent for.
//
// A table, matching every other workbench list: each row carries the same facts
// (its endpoint, the events it listens for, whether it's active, when it was
// added) and people scan DOWN a column — "which are paused", "what's newest".
// The whole set is loaded in one call, so filtering it in the browser filters
// the WHOLE set — honest in a way client-filtering a server-paged window isn't.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Table,
} from '@wizeworks/silicaui-react';
import { Plus, Webhook } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  eventLabel,
  formatDateTime,
  useWebhooks,
  webhookState,
  type WebhookSubscription,
} from './webhooks-data';
import { RowOpenHint } from '../../components/row-open-hint';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A short, readable summary of what a webhook listens for: the first couple of
 *  event names, then "+N more" so a webhook on everything doesn't wrap to four
 *  lines. */
function eventsSummary(events: string[]): string {
  if (events.length === 0) return 'No events chosen';
  const names = events.map(eventLabel);
  if (names.length <= 2) return names.join(' · ');
  return `${names.slice(0, 2).join(' · ')} · +${String(names.length - 2)} more`;
}

export function WebhooksListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useWebhooks();

  const all = useMemo(() => data ?? [], [data]);
  const term = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      term === ''
        ? all
        : all.filter(
            (w) => w.name.toLowerCase().includes(term) || w.url.toLowerCase().includes(term)
          ),
    [all, term]
  );

  const staleAfterFailure = Boolean(error) && all.length > 0;

  const open = (webhook: WebhookSubscription, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('cms.webhooks.detail', { id: webhook.id }, { target: targetFor(event) });
  };

  const create = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('cms.webhooks.detail', { id: 'new' }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Webhooks list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search webhooks"
              placeholder="Name or address…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="Set up a new webhook — hold Shift to open alongside, Alt for a new window"
            onClick={create}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @xl:inline">New webhook</span>
          </Button>
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

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {staleAfterFailure ? (
          <Alert color="warning" className="m-2">
            <AlertContent>
              <AlertTitle>Could not check for changes just now</AlertTitle>
              <AlertDescription>
                This is a problem reaching the server. What you see below is what loaded last, and
                may be out of date.
              </AlertDescription>
            </AlertContent>
            <Button
              size="sm"
              color="warning"
              variant="soft"
              onClick={() => {
                void refetch();
              }}
            >
              Try again
            </Button>
          </Alert>
        ) : null}

        {error && !staleAfterFailure ? (
          <EmptyState
            icon={<Webhook className="size-6" aria-hidden />}
            title="Could not load your webhooks"
            description="This is a problem reaching the server. None of your webhooks have been changed or lost."
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
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : rows.length === 0 ? (
          <ListEmptyState
            filtered={term !== ''}
            noResults={{
              icon: <Webhook className="size-6" aria-hidden />,
              title: 'Nothing matches that',
              description:
                'No webhook has a name or address matching that. Clear the search to see them all.',
            }}
            firstRun={{
              title: 'No webhooks yet',
              description:
                'A webhook tells another system the moment something happens here — a page is published, a file is uploaded. It is useful when a developer is building on top of your content and wants to be notified automatically.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    create({ shiftKey: false, altKey: false });
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Set up a webhook
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th className="hidden @xl:table-cell">Events</th>
                <th className="hidden @4xl:table-cell">Added</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((webhook) => {
                const state = webhookState(webhook.active);
                return (
                  <tr
                    key={webhook.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(webhook, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(webhook, event);
                    }}
                  >
                    <td>
                      <span className="block max-w-72 truncate font-medium">{webhook.name}</span>
                      <span className="block max-w-72 truncate font-mono text-sm">
                        {webhook.url}
                      </span>
                    </td>
                    <td className="hidden max-w-64 truncate @xl:table-cell">
                      {eventsSummary(webhook.events)}
                    </td>
                    <td className="hidden text-sm whitespace-nowrap @4xl:table-cell">
                      {formatDateTime(webhook.createdAt)}
                    </td>
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
        )}
      </Card>

      <RowOpenHint />
    </div>
  );
}
