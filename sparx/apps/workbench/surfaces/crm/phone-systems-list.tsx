'use client';

// Connected phone systems (docs/144 §5.6) — the account sparx places calls
// through, and the number customers see ring.
//
// THIS IS THE LIST, AND ONLY THE LIST. Connecting one is
// `crm.phone-system.connect`, its own pane — see that file for why a pane and
// not a dialog, and for the two load-bearing decisions the form carries (which
// site calls from the number, and call recording being opt-in). It used to be a
// form parked above this table, which is neither of the two shapes docs/123
// allows: it sat permanently on top of what people came here to look at, pushed
// the list down the page on every visit for the sake of an action taken once,
// and duplicated the empty state directly underneath itself.

import { Badge, Button, Card, EmptyState, Table, useToast } from '@wizeworks/silicaui-react';
import { Phone, PhoneCall, Plus, Trash2 } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { useSites } from '../../lib/api/shell-data';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  isModuleDisabled,
  isVoiceForbidden,
  useDisconnectPhoneSystem,
  useVoiceConnections,
  voiceStatusLabel,
  voiceStatusTone,
} from './calls-data';

/** Shift opens alongside, Alt pops out — the same modifier contract every other
 *  list in the workbench honours. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function PhoneSystemsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();

  const { data, error, isPending, isError, isFetching, dataUpdatedAt, refetch } =
    useVoiceConnections();
  const { data: sites } = useSites();
  const disconnect = useDisconnectPhoneSystem();

  const rows = data?.items ?? [];
  const moduleOff = isModuleDisabled(error);
  // Only an admin may read or write these, and a rep who opens the surface
  // should be told that plainly rather than shown an empty table.
  const forbidden = isVoiceForbidden(error);
  const siteList = sites ?? [];

  const siteName = (propertyId: string | null): string => {
    if (!propertyId) return 'Every site';
    return siteList.find((site) => site.id === propertyId)?.name ?? 'One site';
  };

  const connectPhoneSystem = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.phone-system.connect', {}, { target: targetFor(event) });
  };

  const remove = async (id: string, fromNumber: string) => {
    const ok = await confirm({
      title: `Disconnect ${fromNumber}?`,
      description:
        'sparx stops placing calls through this account. The calls already logged on your customers’ records are kept — disconnecting has never meant deleting your call history.',
      confirmLabel: 'Disconnect it',
      cancelLabel: 'Keep it connected',
      color: 'danger',
    });
    if (!ok) return;
    disconnect.mutate(id, {
      onSuccess: () => {
        toast.add({ title: 'Phone system disconnected', type: 'success' });
      },
      onError: () => {
        toast.add({ title: 'Could not disconnect that phone system', type: 'error' });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Phone system controls"
        controls={
          <>
            <Button
              color="module"
              size="sm"
              disabled={forbidden || moduleOff}
              title="Connect a phone system — hold Shift to open alongside, Alt for a new window"
              onClick={connectPhoneSystem}
            >
              <Plus className="size-4" aria-hidden />
              Connect a phone system
            </Button>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <Card className="min-h-0 flex-1">
          {moduleOff ? (
            <EmptyState
              icon={<PhoneCall className="size-6" aria-hidden />}
              title="Turn on Customers to connect a phone system"
              description="Connecting a phone system puts a Call button on every customer’s record, and writes each call onto their history without anyone having to remember to log it."
            />
          ) : forbidden ? (
            <EmptyState
              icon={<PhoneCall className="size-6" aria-hidden />}
              title="Only an owner or admin can set this up"
              description="Connecting a phone system means handing over an account token, so it is kept to the people who run the account. Ask one of them to connect it — once it is done, everyone on your team gets the Call button."
            />
          ) : isError ? (
            <EmptyState
              icon={<PhoneCall className="size-6" aria-hidden />}
              title="Could not load your phone systems"
              description="Something went wrong reaching the server. It may be temporary — try again in a moment."
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
            <p className="p-4 text-sm" role="status">
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<PhoneCall className="size-6" aria-hidden />}
              title="No phone system connected yet"
              description="Connect your phone account and a Call button appears on every customer’s record. sparx rings you first, then dials them and joins the two of you — so the call is logged without anyone writing it down afterwards."
              actions={
                <Button size="sm" color="module" onClick={connectPhoneSystem}>
                  Connect a phone system
                </Button>
              }
            />
          ) : (
            <Table size="sm">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Used by</th>
                  <th>State</th>
                  <th className="hidden @lg:table-cell">Recording</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">
                      {row.fromNumber}
                      <span className="block text-sm font-normal">{row.accountSid}</span>
                    </td>
                    <td>
                      {/* Which business this number speaks for — the thing that
                          decides who gets called from it. */}
                      <Badge color={row.propertyId ? 'module' : 'info'} variant="soft" size="sm">
                        {siteName(row.propertyId)}
                      </Badge>
                    </td>
                    <td>
                      <Badge color={voiceStatusTone(row.status)} variant="soft" size="sm">
                        {voiceStatusLabel(row.status)}
                      </Badge>
                      {row.lastError ? (
                        <span className="mt-1 block text-xs">{row.lastError}</span>
                      ) : null}
                    </td>
                    <td className="hidden @lg:table-cell">
                      {/* A legal posture, not a setting — so it reads as one. */}
                      <Badge
                        color={row.recordingEnabled ? 'warning' : 'neutral'}
                        variant="soft"
                        size="sm"
                      >
                        {row.recordingEnabled ? 'Recording on' : 'Not recording'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          color="danger"
                          variant="ghost"
                          title="Disconnect this phone system"
                          onClick={() => {
                            void remove(row.id, row.fromNumber);
                          }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          <span className="sr-only">Disconnect</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <p className="shrink-0 px-1 text-xs">
        <Phone className="mr-1 inline size-3" aria-hidden />
        To change the token on a connected number, disconnect it and connect it again — sparx never
        shows a token back, so there is nothing to edit in place.
      </p>
    </div>
  );
}
