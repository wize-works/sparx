'use client';

// LINKED CALENDARS — the diary's secondary pane, reached from the calendar's
// toolbar. A member of staff (or a bay, or a room) can have an OUTSIDE calendar
// linked so their commitments there block times here, and two bookings never
// land on one person who was already busy.
//
// This is a pane, not a modal, and deliberately: a connection is a durable thing
// you come back to — to resync it, to read the error when a feed goes stale, to
// remove one. Adding a feed is a short form INSIDE this pane rather than a modal
// over it, because the pane is exactly the place you'd return to afterwards.
//
// Only the friction-free path — a read-only calendar link (iCal) — is offered
// here. It needs no passwords and no redirect dance: paste the secret .ics URL a
// calendar app gives you, and outside busy time starts blocking sparx slots.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { CalendarPlus, Link2, RefreshCw, Trash2 } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useSchedulingResources } from './bookings-data';
import {
  calendarErrorMessage,
  connectionStateMeta,
  providerLabel,
  useAddIcalFeed,
  useConnections,
  useOAuthProviders,
  useRemoveConnection,
  useSyncConnection,
  type CalendarConnection,
} from './calendar-data';

const COLUMN = 'mx-auto flex w-full max-w-2xl flex-col gap-4';

export function CalendarConnectionsSurface(_props: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();

  const resources = useSchedulingResources();
  const providers = useOAuthProviders();
  const connections = useConnections();

  const add = useAddIcalFeed();
  const sync = useSyncConnection();
  const remove = useRemoveConnection();

  const [resourceId, setResourceId] = useState('');
  const [url, setUrl] = useState('');

  const activeResources = resources.data ?? [];
  const resourceName = (id: string) =>
    activeResources.find((resource) => resource.id === id)?.name ?? 'A resource';

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarConnection[]>();
    for (const connection of connections.data ?? []) {
      const list = map.get(connection.resourceId) ?? [];
      list.push(connection);
      map.set(connection.resourceId, list);
    }
    return [...map.entries()];
  }, [connections.data]);

  const trimmedUrl = url.trim();
  const canAdd = resourceId !== '' && trimmedUrl !== '' && !add.isPending;
  useDirtySource(
    trimmedUrl !== '' && !add.isSuccess,
    'You have typed a calendar link but not added it yet. Close anyway?'
  );

  const cryptoOff = providers.data ? !providers.data.cryptoConfigured : false;

  const onAdd = () => {
    if (!canAdd) return;
    add.mutate(
      { resourceId, icalUrl: trimmedUrl },
      {
        onSuccess: () => {
          setUrl('');
          toast.add({
            title: 'Calendar linked',
            description: 'Outside busy time will now block bookings here.',
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not link that calendar',
            description: calendarErrorMessage(
              error,
              'Check the link is the secret .ics address your calendar app gives you.'
            ),
            type: 'error',
          });
        },
      }
    );
  };

  const onSync = (connection: CalendarConnection) => {
    sync.mutate(connection.id, {
      onSuccess: () => {
        toast.add({ title: 'Refreshed from the outside calendar', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not refresh that calendar',
          description: calendarErrorMessage(error, 'The outside calendar could not be reached.'),
          type: 'error',
        });
      },
    });
  };

  const onRemove = async (connection: CalendarConnection) => {
    const ok = await confirm({
      title: 'Remove this linked calendar?',
      description: `${resourceName(connection.resourceId)}'s ${providerLabel(connection.provider)} will no longer block times here. The outside calendar itself is untouched, and you can link it again later.`,
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'error',
    });
    if (!ok) return;
    remove.mutate(connection.id, {
      onSuccess: () => {
        toast.add({ title: 'Calendar unlinked', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove that calendar',
          description: calendarErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Linked calendars actions"
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={connections.isFetching}
            updatedAt={connections.data ? connections.dataUpdatedAt : undefined}
            onRefresh={() => {
              void connections.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Linked calendars
            </Heading>
            <Text>
              Link a member of staff&rsquo;s outside calendar — Google, Outlook, Apple — so the
              times they are busy elsewhere are blocked here too. Nobody gets booked when they
              already have something on.
            </Text>
          </div>

          {cryptoOff ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>Calendar sync is not set up yet</AlertTitle>
                <AlertDescription>
                  This account cannot link outside calendars until sync is switched on for it. Your
                  bookings are unaffected.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : (
            <FormSection
              title="Link a calendar"
              description="Paste the secret calendar link (an .ics address) from a person's calendar app, and choose who it belongs to."
            >
              <Field>
                <FieldLabel>Whose calendar?</FieldLabel>
                <NativeSelect
                  aria-label="Who this calendar belongs to"
                  value={resourceId}
                  disabled={activeResources.length === 0}
                  onChange={(domEvent) => {
                    setResourceId(domEvent.target.value);
                  }}
                >
                  <option value="">Choose a person or resource…</option>
                  {activeResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))}
                </NativeSelect>
                {activeResources.length === 0 ? (
                  <FieldDescription>
                    Add a member of staff or a resource first, then you can link their calendar.
                  </FieldDescription>
                ) : null}
              </Field>

              <Field>
                <FieldLabel>Calendar link</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={url}
                      placeholder="https://calendar.example.com/…/basic.ics"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(domEvent) => {
                        setUrl(domEvent.target.value);
                      }}
                      onKeyDown={(domEvent) => {
                        if (domEvent.key === 'Enter') onAdd();
                      }}
                    />
                  }
                />
                <FieldDescription>
                  In most calendar apps this is under &ldquo;share&rdquo; or &ldquo;secret
                  address&rdquo;. It is read-only — nothing here is written back to it.
                </FieldDescription>
              </Field>

              <div>
                <Button
                  size="sm"
                  color="module"
                  loading={add.isPending}
                  disabled={!canAdd}
                  onClick={onAdd}
                >
                  <CalendarPlus className="size-4" aria-hidden />
                  Link calendar
                </Button>
              </div>
            </FormSection>
          )}

          {connections.isError ? (
            <Alert color="error">
              <AlertContent>
                <AlertTitle>Could not load linked calendars</AlertTitle>
                <AlertDescription>
                  This is a problem reaching the server. Any calendars already linked keep working.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : connections.isPending ? (
            <p className="text-sm" role="status">
              Loading…
            </p>
          ) : grouped.length === 0 ? (
            <EmptyState
              icon={<Link2 className="size-6" aria-hidden />}
              title="No calendars linked yet"
              description="Once you link a calendar above, the times its owner is busy elsewhere will show as unavailable in your diary."
            />
          ) : (
            grouped.map(([groupResourceId, groupConnections]) => (
              <FormSection key={groupResourceId} title={resourceName(groupResourceId)}>
                <div className="flex flex-col gap-2">
                  {groupConnections.map((connection) => (
                    <ConnectionRow
                      key={connection.id}
                      connection={connection}
                      syncing={sync.isPending && sync.variables === connection.id}
                      removing={remove.isPending && remove.variables === connection.id}
                      onSync={() => {
                        onSync(connection);
                      }}
                      onRemove={() => {
                        void onRemove(connection);
                      }}
                    />
                  ))}
                </div>
              </FormSection>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectionRow({
  connection,
  syncing,
  removing,
  onSync,
  onRemove,
}: {
  connection: CalendarConnection;
  syncing: boolean;
  removing: boolean;
  onSync: () => void;
  onRemove: () => void;
}) {
  const state = connectionStateMeta(connection.status);
  return (
    <div className="border-base-300 flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="font-medium">{providerLabel(connection.provider)}</Text>
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
        </div>
        {connection.status === 'error' && connection.lastError ? (
          <Text className="text-sm">{connection.lastError}</Text>
        ) : connection.lastSyncedAt ? (
          <Text className="text-sm">
            Last refreshed <Timestamp value={connection.lastSyncedAt} format="relative" />
          </Text>
        ) : (
          <Text className="text-sm">Not refreshed yet</Text>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" color="neutral" loading={syncing} onClick={onSync}>
          <RefreshCw className="size-4" aria-hidden />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="ghost"
          color="danger"
          shape="square"
          aria-label="Remove this linked calendar"
          title="Remove this linked calendar"
          loading={removing}
          onClick={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export default CalendarConnectionsSurface;
