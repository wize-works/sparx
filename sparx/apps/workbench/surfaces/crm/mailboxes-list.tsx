'use client';

// Connected mailboxes (docs/144 §5.2) — the email accounts sparx reads from and
// sends through.
//
// THIS IS THE LIST, AND ONLY THE LIST. Connecting one is `crm.mailbox.connect`,
// its own pane — see that file for why a pane and not a dialog. It used to be a
// form parked above this table, which is neither of the two shapes docs/123
// allows: it sat permanently on top of what people came here to look at, pushed
// the list down the page on every visit for the sake of an action taken once,
// and duplicated the empty state directly underneath itself.

import { Badge, Button, Card, EmptyState, Table, useToast } from '@wizeworks/silicaui-react';
import { Mailbox, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  describeLastSync,
  isModuleDisabled,
  mailboxErrorMessage,
  statusLabel,
  statusTone,
  useDisconnectMailbox,
  useMailboxes,
  useSyncMailbox,
} from './mailboxes-data';

/** Shift opens alongside, Alt pops out — the same modifier contract every other
 *  list in the workbench honours. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function MailboxesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();

  const { data, error, isPending, isError, isFetching, dataUpdatedAt, refetch } = useMailboxes();
  const disconnect = useDisconnectMailbox();
  const sync = useSyncMailbox();

  const rows = data?.items ?? [];
  const moduleOff = isModuleDisabled(error);

  const connectMailbox = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.mailbox.connect', {}, { target: targetFor(event) });
  };

  const runSync = (id: string) => {
    sync.mutate(id, {
      onSuccess: (result) => {
        if (!result.ok) {
          toast.add({
            title: 'Could not check that mailbox',
            description: result.error ?? 'Try again in a moment.',
            type: 'error',
          });
          return;
        }
        toast.add({
          title:
            result.stored === 0
              ? 'Nothing new from anyone on your list'
              : `${String(result.stored)} new ${result.stored === 1 ? 'message' : 'messages'} added`,
          type: 'success',
        });
      },
      onError: (err: unknown) => {
        toast.add({
          title: 'Could not check that mailbox',
          description: mailboxErrorMessage(err, 'Try again in a moment.'),
          type: 'error',
        });
      },
    });
  };

  const remove = async (id: string, address: string) => {
    const ok = await confirm({
      title: `Disconnect ${address}?`,
      description:
        'sparx stops reading new email from this mailbox and stops sending through it. The conversations already on your customers’ records are kept — disconnecting a mailbox has never meant deleting a year of correspondence.',
      confirmLabel: 'Disconnect it',
      cancelLabel: 'Keep it connected',
      color: 'danger',
    });
    if (!ok) return;
    disconnect.mutate(id, {
      onSuccess: () => {
        toast.add({ title: 'Mailbox disconnected', type: 'success' });
      },
      onError: () => {
        toast.add({ title: 'Could not disconnect that mailbox', type: 'error' });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Mailbox controls"
        controls={
          <>
            <Button
              color="module"
              size="sm"
              title="Connect a mailbox — hold Shift to open alongside, Alt for a new window"
              onClick={connectMailbox}
            >
              <Plus className="size-4" aria-hidden />
              Connect a mailbox
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
              icon={<Mailbox className="size-6" aria-hidden />}
              title="Turn on Customers to connect a mailbox"
              description="Connecting a mailbox puts the emails you exchange with a customer onto their record, so anyone on your team can see the conversation."
            />
          ) : isError ? (
            <EmptyState
              icon={<Mailbox className="size-6" aria-hidden />}
              title="Could not load your mailboxes"
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
              icon={<Mailbox className="size-6" aria-hidden />}
              title="No mailbox connected yet"
              description="Connect the email account you write to customers from. Their replies will appear on their record, so the next person to pick up the conversation can see what was already said."
              actions={
                <Button size="sm" color="module" onClick={connectMailbox}>
                  Connect a mailbox
                </Button>
              }
            />
          ) : (
            <Table size="sm">
              <thead>
                <tr>
                  <th>Mailbox</th>
                  <th>Used by</th>
                  <th>State</th>
                  <th className="hidden @lg:table-cell">Last checked</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium">
                      {row.emailAddress}
                      {row.displayName ? (
                        <span className="block text-sm font-normal">{row.displayName}</span>
                      ) : null}
                    </td>
                    <td>
                      {/* Personal vs shared is a privacy boundary, not a
                          preference, so it wears a real color. */}
                      <Badge
                        color={row.scope === 'shared' ? 'warning' : 'module'}
                        variant="soft"
                        size="sm"
                      >
                        {row.scope === 'shared' ? 'Whole team' : 'One person'}
                      </Badge>
                      <span className="mt-1 block text-xs">
                        {row.syncGate === 'known_contacts_only'
                          ? 'Keeps only known contacts'
                          : 'Keeps everything'}
                      </span>
                    </td>
                    <td>
                      <Badge color={statusTone(row.status)} variant="soft" size="sm">
                        {statusLabel(row.status)}
                      </Badge>
                      {row.lastError ? (
                        <span className="mt-1 block text-xs">{row.lastError}</span>
                      ) : null}
                    </td>
                    <td className="hidden text-sm @lg:table-cell">
                      {describeLastSync(row.lastSyncedAt)}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          color="module"
                          variant="ghost"
                          title="Check for new mail now"
                          disabled={sync.isPending}
                          onClick={() => {
                            runSync(row.id);
                          }}
                        >
                          <RefreshCw className="size-4" aria-hidden />
                          <span className="sr-only">Check for new mail</span>
                        </Button>
                        <Button
                          size="sm"
                          color="danger"
                          variant="ghost"
                          title="Disconnect this mailbox"
                          onClick={() => {
                            void remove(row.id, row.emailAddress);
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
        sparx checks connected mailboxes every few minutes. Use the refresh button on a row to check
        one right now.
      </p>
    </div>
  );
}
