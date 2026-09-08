'use client';

// The do-not-email list — every address sparx will not send to, and why.
//
// This is a TABLE, deliberately, where most workbench lists are cards. The rule
// against tables is about short, grouped lists of one-line things where columns
// get invented to justify themselves. This is the opposite: a flat list that can
// run to hundreds of rows (the email system mirrors every bounce and spam report
// here), every row carrying four genuine, uniform facts — the address, why it is
// held back, who put it here, and when. A table with real columns and real paging
// is the honest shape for that, the same call the team roster makes.
//
// Rows are NOT clickable: a suppression has no detail screen to open. It is a
// fact, not a thing you manage — so the only per-row action is removing it, and
// that is behind a confirm because removing it means sparx may email that person
// again.
//
// Copy is for someone who owns a business, not a mail server. Nothing says
// "bounce", "complaint" or "suppression" without saying what it means: an address
// that "did not work", an email someone "marked as spam", a list of people sparx
// "will not email".

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Table,
  Text,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { Plus, ShieldOff, Trash2, TriangleAlert } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { ListPagination, type PageSize } from '../../components/list-pagination';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { AddSuppressionModal } from './add-suppression-modal';
import {
  formatDate,
  reasonMeta,
  scopeNote,
  sourceLabel,
  suppressionErrorMessage,
  useRemoveSuppression,
  useSuppressions,
  type Suppression,
} from './suppressions-data';

export function SuppressionsListSurface(_props: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const remove = useRemoveSuppression();

  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);

  const params = useMemo(
    () => ({ q: search, take: pageSize, skip: (page - 1) * pageSize }),
    [search, pageSize, page]
  );
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useSuppressions(params);

  const items = data?.items ?? [];
  const total = data?.total;
  const searching = search.trim() !== '';

  /** Every route back to the search box resets to page 1: changing what matches
   *  has to send you to the first page, or a settled page 3 goes blank when the
   *  result set narrows to four rows sitting on page 1. */
  const changeSearch = (next: string) => {
    setSearch(next);
    setPage(1);
  };

  const removeRow = (row: Suppression) => {
    void confirm({
      // The confirm NAMES the address — "Remove this?" over a list of near-identical
      // rows is how the wrong person starts getting email again.
      title: `Start emailing ${row.email} again?`,
      description:
        'Taking this address off your do-not-email list means sparx may send it emails again — newsletters, offers and account messages. Only do this if you are sure they want to hear from you.',
      confirmLabel: 'Remove from list',
      cancelLabel: 'Keep it blocked',
      color: 'danger',
    }).then((ok) => {
      if (!ok) return;
      remove.mutate(row.id, {
        onSuccess: () => {
          toast.add({ title: `${row.email} can be emailed again`, type: 'success' });
        },
        onError: (err) => {
          toast.add({
            title: `Could not remove ${row.email}`,
            description: suppressionErrorMessage(
              err,
              'Nothing changed — they are still on your do-not-email list. Try again in a moment.'
            ),
            type: 'error',
          });
        },
      });
    });
  };

  // Shown INSTEAD of the list, never above a half-loaded one — a do-not-email
  // list missing rows looks exactly like one that lost people, and someone will
  // email a person who opted out on the strength of it.
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <Alert color="error" className="max-w-md">
          <TriangleAlert />
          <AlertContent>
            <AlertTitle>Could not load your do-not-email list</AlertTitle>
            <AlertDescription>
              This is a problem reaching the server, not with your list. Everyone on it is still
              being held back from your emails.
            </AlertDescription>
          </AlertContent>
          <AlertActions>
            <Button
              size="sm"
              color="error"
              variant="soft"
              onClick={() => {
                void refetch();
              }}
            >
              Try again
            </Button>
          </AlertActions>
        </Alert>
      </div>
    );
  }

  const busy = remove.isPending;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Do-not-email list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search the do-not-email list by address"
              placeholder="Search addresses…"
              value={search}
              onValueChange={changeSearch}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0 whitespace-nowrap"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add an address
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

      {/* Mounted for the whole life of the surface, so the list refetching behind
          it can never take a half-typed address with it. */}
      <AddSuppressionModal
        open={adding}
        onClose={() => {
          setAdding(false);
        }}
      />

      <div className="@container flex min-h-0 flex-1 flex-col gap-2">
        <Card className="min-h-0 flex-1 overflow-y-auto">
          {isPending ? (
            <p className="p-4" role="status">
              Loading your do-not-email list…
            </p>
          ) : items.length === 0 ? (
            searching ? (
              // A search that found nothing is NOT an empty list — the two must
              // never share a message, or an owner with hundreds of held-back
              // addresses who mistyped one concludes the list is empty.
              <EmptyState
                icon={<ShieldOff className="size-6" aria-hidden />}
                title={`No addresses match "${search.trim()}"`}
                description="Try part of the email address, or clear the search to see the whole list."
                actions={
                  <Button
                    color="neutral"
                    variant="soft"
                    size="sm"
                    onClick={() => {
                      changeSearch('');
                    }}
                  >
                    Show every address
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={<ShieldOff className="size-6" aria-hidden />}
                title="Nobody is blocked from your emails"
                description="When someone unsubscribes or an address stops working, they land here automatically and sparx stops emailing them. You can also add an address by hand."
                actions={
                  <Button
                    color="module"
                    size="sm"
                    onClick={() => {
                      setAdding(true);
                    }}
                  >
                    <Plus className="size-4" aria-hidden />
                    Add an address
                  </Button>
                }
              />
            )
          ) : (
            <Table size="sm" hover>
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Reason</th>
                  <th className="hidden @xl:table-cell">How it got here</th>
                  <th className="hidden @md:table-cell">Added</th>
                  <th className="text-right">Remove</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const reason = reasonMeta(row.reason);
                  const note = scopeNote(row.scope);
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="flex min-w-0 flex-col">
                          <span className="font-mono text-base break-all">{row.email}</span>
                          {/* Only when this suppression is NARROWER than
                              everything — the common "blocked from all email" case
                              is what the whole list means and needs no note. */}
                          {note ? <span className="text-sm">{note}</span> : null}
                        </div>
                      </td>
                      <td>
                        <Tooltip content={reason.detail || reason.label}>
                          <Badge color={reason.tone} variant="soft" size="sm">
                            {reason.label}
                          </Badge>
                        </Tooltip>
                      </td>
                      <td className="hidden @xl:table-cell">
                        <Text className="text-sm">{sourceLabel(row.source)}</Text>
                      </td>
                      <td className="hidden whitespace-nowrap @md:table-cell">
                        <Text className="text-sm">{formatDate(row.createdAt)}</Text>
                      </td>
                      <td className="text-right">
                        <Tooltip content="Remove from the do-not-email list">
                          <Button
                            color="danger"
                            variant="ghost"
                            size="sm"
                            shape="square"
                            disabled={busy}
                            aria-label={`Remove ${row.email} from the do-not-email list`}
                            onClick={() => {
                              removeRow(row);
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        {/* Outside the Card so it does not scroll away with the rows. Hidden when
            there is nothing to page — the empty states already say what happened,
            and a pager under them is a second, quieter voice about a list that
            isn't there. */}
        {!isPending && items.length > 0 ? (
          <div className="shrink-0">
            <ListPagination
              shown={items.length}
              firstRow={(page - 1) * pageSize + 1}
              total={total}
              page={page}
              pageSize={pageSize}
              // Every row of a window is fetched at once and the endpoint counts
              // the total, so numbered pages do the whole job — there is no wider
              // window to "load more" of.
              canLoadMore={false}
              busy={isFetching}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        ) : null}
      </div>

      {/* The one thing this list raises and does not answer, said once at the
          bottom: why addresses appear here on their own. */}
      <p className="shrink-0 px-1 text-sm">
        People land here automatically when they unsubscribe or their address stops working. Keeping
        them here is what protects your emails from being treated as spam.
      </p>
    </div>
  );
}
