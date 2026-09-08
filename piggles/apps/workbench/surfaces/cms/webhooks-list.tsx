'use client';

// The notifications you send other software — where they go, what triggers
// them, and whether they are actually arriving.
//
// A table, matching every other workbench list: each row carries the same facts
// (its endpoint, the events it listens for, whether it's active, when it was
// added) and people scan DOWN a column — "which are paused", "what's newest".
// The whole set is loaded in one call, so filtering it in the browser filters
// the WHOLE set — honest in a way client-filtering a server-paged window isn't.

import { useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  SearchInput,
} from '@wizeworks/silicaui-react';
import { Table } from '../../components/table';
import { faPlus, faWebhook } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneLoadError } from '../../components/pane-load-error';
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

/** Registry module for this surface, so the brand's empty-state artwork is this
 *  app's own picture rather than the generic one. */
const MODULE = 'cms';

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
        label="Notification list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search notifications"
              placeholder="Name or address…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primaryAction={{
          label: 'Set one up',
          icon: faPlus,
          onClick: create,
          title: 'Set up a new notification — hold Shift to open alongside, Alt for a new window',
        }}
        views={{
          target: '/cms/webhooks',
          params: { q: search },
          onApply: (next) => {
            setSearch(next.q ?? '');
          },
        }}
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
          <PaneLoadError
            icon={<Icon glyph={faWebhook} className="size-6" aria-hidden />}
            title="Could not load these"
            description="This is a problem reaching the server. Nothing you have set up has been changed or lost."
            onRetry={() => {
              void refetch();
            }}
          />
        ) : isLoading ? (
          <PaneWaiting />
        ) : rows.length === 0 ? (
          <ListEmptyState
            module={MODULE}
            filtered={term !== ''}
            noResults={{
              icon: <Icon glyph={faWebhook} className="size-6" aria-hidden />,
              title: 'Nothing matches that',
              description:
                'Nothing here has a name or address matching that. Clear the search to see them all.',
            }}
            firstRun={{
              title: 'Nothing is being told yet',
              description:
                'You can have us tell another system the moment something happens here — a page goes live, a file is uploaded, stock runs out. Useful when someone is building on top of your content and wants to know without having to keep checking.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    create({ shiftKey: false, altKey: false });
                  }}
                >
                  <Icon glyph={faPlus} className="size-4" aria-hidden />
                  Set one up
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Where it goes</th>
                <th className="hidden @xl:table-cell">What triggers it</th>
                <th className="hidden @4xl:table-cell">Set up</th>
                <th>How it is going</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((webhook) => {
                const state = webhookState(webhook.active, webhook.health);
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
