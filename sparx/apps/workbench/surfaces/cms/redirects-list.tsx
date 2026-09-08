'use client';

// Redirects — the old-link-to-new-link rules for this site.
//
// A table, because every rule is the same three facts (where it catches people,
// where it sends them, whether the move is permanent) and people scan DOWN the
// "from" column hunting for the one rule on /old-pricing. There is no detail
// pane: a redirect has no editable surface — it is created, imported, or
// deleted, never changed in place — so rows are not clickable, and the only
// per-row action is delete.
//
// SEARCH IS CLIENT-SIDE, unlike the content list, because the redirects endpoint
// offers no text query and adding one is a backend change out of scope here.
// That is only honest while the whole set is loaded, so this pane pulls one
// generous window (the server's 250 ceiling) rather than paging — a redirect
// table is a bounded configuration set, not an unbounded feed — and says so
// plainly if a site somehow runs past it.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Filter,
  FilterItem,
  Input,
  NativeSelect,
  SearchInput,
  Table,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ArrowRight, CornerUpRight, Plus, Trash2, Upload } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { PaneScope } from '../../lib/dock/window-boundary';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  formatDate,
  normalizePath,
  redirectErrorMessage,
  redirectTypeMeta,
  useCreateRedirect,
  useDeleteRedirect,
  useRedirects,
  type Redirect,
  type RedirectStatusCode,
} from './redirects-data';

/** The server's single-request ceiling. A config table well within it. */
const WINDOW = 250;

/** Client-side type filter. "Permanent" folds 301+308, "Temporary" 302+307 —
 *  the same distinction the badge draws, so the filter matches what people see. */
const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'permanent', label: 'Permanent' },
  { value: 'temporary', label: 'Temporary' },
] as const;

type TypeFilterValue = (typeof TYPE_FILTERS)[number]['value'];

function isTemporary(code: RedirectStatusCode): boolean {
  return code === 302 || code === 307;
}

/* ── Add one redirect ───────────────────────────────────────────────────────
 *
 * A modal, and one that earns it: two paths and a permanent/temporary choice,
 * over in seconds, with nothing durable to return to afterwards (a redirect has
 * no manage surface — it only ever exists in this list). Abandoning it costs at
 * most retyping two short fields, so it clears all four modal tests. Bulk import,
 * which is multi-line paste with real work to lose, is a pane instead.
 */
function AddRedirectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const toast = useToast();
  const create = useCreateRedirect();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [permanent, setPermanent] = useState(true);

  const reset = () => {
    setFrom('');
    setTo('');
    setPermanent(true);
    create.reset();
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const fromPath = normalizePath(from);
  const toPath = normalizePath(to);
  const sameAddress = fromPath !== '' && fromPath === toPath;
  const canSubmit = fromPath !== '' && toPath !== '' && !sameAddress && !create.isPending;

  const submit = () => {
    if (!canSubmit) return;
    create.mutate(
      { from_path: fromPath, to_path: toPath, status_code: permanent ? 301 : 302 },
      {
        onSuccess: () => {
          close();
          afterPaneChange(() => {
            toast.add({
              title: 'Redirect added',
              description: `Anyone visiting ${fromPath} now lands on ${toPath}.`,
              type: 'success',
            });
          });
        },
        // A failure names the exact problem — a duplicate, a loop, a rule that
        // points at itself — and that sentence is shown in the dialog rather than
        // a toast that vanishes mid-read.
      }
    );
  };

  const failure = create.isError
    ? redirectErrorMessage(create.error, 'Could not add that redirect. Nothing was changed.')
    : null;

  return (
    <PaneScope>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden">
          <DialogTitle>Add a redirect</DialogTitle>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2">
            <SaveFailure title="Could not add that redirect" message={failure} />

            <Field>
              <FieldLabel required>Old address</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={from}
                    placeholder="/old-pricing"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      setFrom(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                The address people are still using — the one you want to catch. Just the part after
                your domain, starting with a slash.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel required>Send them to</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={to}
                    placeholder="/pricing"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      setTo(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submit();
                    }}
                  />
                }
              />
              <FieldDescription>
                Where the old address should take them instead — another page on this same site.
              </FieldDescription>
            </Field>

            {sameAddress ? (
              <Text className="text-sm">
                The old and new addresses are the same — send visitors somewhere different.
              </Text>
            ) : null}

            <Field>
              <FieldLabel>Is this move permanent?</FieldLabel>
              <NativeSelect
                color="module"
                aria-label="Is this move permanent?"
                value={permanent ? 'permanent' : 'temporary'}
                onChange={(event) => {
                  setPermanent(event.target.value === 'permanent');
                }}
              >
                <option value="permanent">Permanent — the page has moved for good</option>
                <option value="temporary">Temporary — it will move back later</option>
              </NativeSelect>
              <FieldDescription>{redirectTypeMeta(permanent ? 301 : 302).detail}</FieldDescription>
            </Field>
          </div>

          <DialogFooter>
            <Button color="neutral" variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button
              color="module"
              size="sm"
              loading={create.isPending}
              disabled={!canSubmit}
              onClick={submit}
            >
              Add redirect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}

/* ── The list ───────────────────────────────────────────────────────────── */

export function RedirectsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const remove = useDeleteRedirect();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>('all');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useRedirects({
    take: WINDOW,
    skip: 0,
  });

  const rows = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total;
  const overWindow = typeof total === 'number' && total > rows.length;
  const staleAfterFailure = Boolean(error) && rows.length > 0;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter === 'temporary' && !isTemporary(row.status_code)) return false;
      if (typeFilter === 'permanent' && isTemporary(row.status_code)) return false;
      if (needle === '') return true;
      return (
        row.from_path.toLowerCase().includes(needle) || row.to_path.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, typeFilter]);

  const narrowed = search.trim() !== '' || typeFilter !== 'all';

  const openImport = (event: { shiftKey: boolean; altKey: boolean }) => {
    // Beside, not on top of, the list: keeping the existing rules in view while
    // pasting new ones is how someone avoids importing a duplicate.
    ctx.open('cms.redirects.import', {}, { target: event.altKey ? 'window' : 'beside' });
  };

  const onDelete = (row: Redirect) => {
    void (async () => {
      const ok = await confirm({
        title: 'Remove this redirect?',
        description: `Anyone still using ${row.from_path} will hit a dead end again instead of being sent to ${row.to_path}. You can add it back later, but any search-engine standing it was passing on is lost.`,
        confirmLabel: 'Remove it',
        cancelLabel: 'Keep it',
        color: 'danger',
      });
      if (!ok) return;
      setRemovingId(row.id);
      remove.mutate(row.id, {
        onSuccess: () => {
          toast.add({ title: 'Redirect removed', type: 'success' });
        },
        onError: (err) => {
          toast.add({
            title: 'Could not remove that redirect',
            description: redirectErrorMessage(err, 'Nothing was changed.'),
            type: 'error',
          });
        },
        onSettled: () => {
          setRemovingId(null);
        },
      });
    })();
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Redirects list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search redirects"
              placeholder="Old or new address…"
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
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @xl:inline">Add redirect</span>
          </Button>
        }
        controls={
          <>
            <Filter
              color="module"
              value={typeFilter}
              onValueChange={(next) => {
                setTypeFilter((next as TypeFilterValue | null) ?? 'all');
              }}
              showReset={false}
              aria-label="Filter by type"
            >
              {TYPE_FILTERS.map((entry) => (
                <FilterItem key={entry.value} value={entry.value}>
                  {entry.label}
                </FilterItem>
              ))}
            </Filter>
            <Button
              color="module"
              variant="soft"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              title="Import a list of redirects — hold Alt to open in a new window"
              onClick={openImport}
            >
              <Upload className="size-4" aria-hidden />
              <span className="hidden @2xl:inline">Bulk import</span>
            </Button>
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

      {overWindow ? (
        <Alert color="info">
          <AlertContent>
            <AlertTitle>Showing the first {rows.length} redirects</AlertTitle>
            <AlertDescription>
              This site has {total} in total — more than this pane loads at once. Search and filter
              cover the ones shown here.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

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
            icon={<CornerUpRight className="size-6" aria-hidden />}
            title="Could not load your redirects"
            description="This is a problem reaching the server. None of your redirects have been lost — they are still sending visitors on as before."
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
        ) : filtered.length === 0 ? (
          <ListEmptyState
            filtered={narrowed}
            noResults={{
              icon: <CornerUpRight className="size-6" aria-hidden />,
              title: 'Nothing matches that',
              description:
                'No redirect matches what you searched or filtered for. Try part of an address, or switch the filter back to All.',
            }}
            firstRun={{
              title: 'No redirects yet',
              description:
                'When you move or rename a page, a redirect sends anyone using the old address to the new one instead of a dead end. Add your first one, or import a whole list at once.',
              actions: (
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    setAdding(true);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add a redirect
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm">
            <thead>
              <tr>
                <th>Redirect</th>
                <th>Type</th>
                <th className="hidden text-right @xl:table-cell">Times used</th>
                <th className="hidden @2xl:table-cell">Added</th>
                <th className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const type = redirectTypeMeta(row.status_code);
                const shared = row.property_id === null;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="max-w-96 truncate font-mono text-sm font-medium">
                          {row.from_path}
                        </span>
                        <span className="flex max-w-96 items-center gap-1 font-mono text-sm">
                          <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{row.to_path}</span>
                        </span>
                        {shared ? (
                          <span className="text-sm">Shared across all your sites</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <Badge color={type.tone} variant="soft" size="sm" title={type.detail}>
                        {type.label}
                      </Badge>
                    </td>
                    <td className="hidden text-right tabular-nums @xl:table-cell">
                      {row.hit_count.toLocaleString()}
                    </td>
                    <td className="hidden text-sm whitespace-nowrap @2xl:table-cell">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        color="danger"
                        shape="square"
                        aria-label={`Remove the redirect from ${row.from_path}`}
                        title="Remove this redirect"
                        loading={removingId === row.id && remove.isPending}
                        disabled={remove.isPending}
                        onClick={() => {
                          onDelete(row);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Text className="shrink-0 px-1 text-sm">
        {filtered.length === rows.length
          ? `${rows.length} ${rows.length === 1 ? 'redirect' : 'redirects'}`
          : `${filtered.length} of ${rows.length} shown`}
      </Text>

      <AddRedirectDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
