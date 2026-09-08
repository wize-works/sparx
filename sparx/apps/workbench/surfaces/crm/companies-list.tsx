'use client';

// The companies list — the organisations this business works with (docs/144 §11).
//
// THE COLUMNS DEPEND ON WHETHER THIS BUSINESS SELLS ON ACCOUNT. A company is a
// CRM record first: for a dental practice or a design studio it is simply the
// firm their contacts work for, and the questions are how many people we know
// there, which email addresses belong to them, and whether the relationship is
// live. Credit limit, discount and payment terms are answers to a question only
// a trade supplier asks — shown to everyone else they are three columns of
// $0.00 and "No agreed terms", which reads as a business with no credit rather
// than a column that does not apply. So the trade columns arrive with the `b2b`
// module and leave with it, exactly as the detail pane's trade panel does.
//
// Either way this earns a table rather than cards: every column is a value an
// owner scans down, and status leads on the right because "who is on hold" is
// what the list gets opened to answer.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
} from '@wizeworks/silicaui-react';
import { Building2, Plus } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useModuleStates } from '../../lib/api/shell-data';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { SavedViewsMenu, viewFilterValue, viewFilters } from './saved-views-menu';
import type { SavedView } from './workspace-data';
import {
  ACCOUNT_STATUSES,
  accountStatusMeta,
  formatMoney,
  paymentTermsLabel,
  useAccounts,
  type Company,
  type CompanyStatus,
} from './companies-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function CompaniesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | CompanyStatus>('all');
  const [viewId, setViewId] = useState<string | null>(null);

  const currentFilters = viewFilters([
    search.trim() !== '' && { field: 'company.search', operator: 'contains', value: search.trim() },
    status !== 'all' && { field: 'company.status', operator: 'eq', value: status },
  ]);

  const applyView = (view: SavedView | null): void => {
    setViewId(view?.id ?? null);
    setSearch(viewFilterValue(view, 'company.search'));
    const nextStatus = viewFilterValue(view, 'company.status');
    setStatus(nextStatus === '' ? 'all' : (nextStatus as CompanyStatus));
  };

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useAccounts({
    q: search,
    status: status === 'all' ? undefined : status,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const filtered = search.trim() !== '' || status !== 'all';

  const modules = useModuleStates();
  const tradeEnabled = (modules.data ?? []).some((m) => m.slug === 'b2b' && m.enabled);

  const statusItems = useMemo(() => {
    const items: Record<string, string> = { all: 'All companies' };
    for (const s of ACCOUNT_STATUSES) items[s] = accountStatusMeta(s).label;
    return items;
  }, []);

  const open = (account: Company, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.account.detail', { id: account.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Company list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              color="module"
              size="sm"
              aria-label="Search companies"
              placeholder="Search by company…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            title="Add a company — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('crm.account.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add a company
          </Button>
        }
        controls={
          <>
            <div className="hidden w-40 shrink-0 @lg:block">
              <Select
                color="module"
                size="sm"
                aria-label="Show which companies"
                value={status}
                items={statusItems}
                onValueChange={(next) => {
                  setStatus(next as 'all' | CompanyStatus);
                }}
              />
            </div>
            <SavedViewsMenu
              objectKey="company"
              current={currentFilters}
              baseline={viewFilters([])}
              nameHint="On hold"
              selectedId={viewId}
              onApply={applyView}
            />
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

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<Building2 className="size-6" aria-hidden />}
            title="Could not load your companies"
            description="Something went wrong reaching the server. It may be a temporary problem — try again in a moment."
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
          <ListEmptyState
            filtered={filtered}
            noResults={{
              icon: <Building2 className="size-6" aria-hidden />,
              title: 'No companies match those filters',
              description: 'Try a different word, or clear the filters to see them all.',
            }}
            firstRun={{
              title: 'No companies yet',
              description: tradeEnabled
                ? 'The businesses you work with live here — each one holding its own credit limit, discount and payment terms, and the people you deal with there.'
                : 'The businesses your contacts work for live here. Add one and you can see everyone you know there in a single place, and let new contacts from their email domain be recognised automatically.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Company</th>
                <th className="text-right">People</th>
                {tradeEnabled ? (
                  <>
                    <th className="text-right">Credit limit</th>
                    <th className="hidden text-right @md:table-cell">Discount</th>
                    <th className="hidden @xl:table-cell">Terms</th>
                  </>
                ) : (
                  <th className="hidden @md:table-cell">Email domains</th>
                )}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = accountStatusMeta(row.status);
                const discount = Number(row.discountPercent);
                // A zero is worth saying out loud — "nobody here yet" is a
                // prompt to add somebody, and an em-dash would read as unknown.
                const people = row._count?.customers ?? 0;
                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    onClick={(event) => {
                      open(row, event);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open(row, event);
                    }}
                  >
                    <td className="font-medium">{row.companyName}</td>
                    <td className="text-right tabular-nums">{people}</td>
                    {tradeEnabled ? (
                      <>
                        <td className="text-right font-mono text-sm tabular-nums">
                          {formatMoney(row.creditLimit)}
                        </td>
                        <td className="hidden text-right font-mono text-sm tabular-nums @md:table-cell">
                          {discount > 0 ? `${String(discount)}%` : '—'}
                        </td>
                        <td className="hidden text-sm @xl:table-cell">
                          {paymentTermsLabel(row.paymentTerms)}
                        </td>
                      </>
                    ) : (
                      <td className="hidden text-sm @md:table-cell">
                        {row.domains.length === 0 ? (
                          '—'
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {row.domains.map((domain) => (
                              <Badge key={domain} color="module" variant="soft" size="sm">
                                {domain}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </td>
                    )}
                    <td>
                      <Badge color={meta.tone} variant="soft" size="sm">
                        {meta.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="flex shrink-0 items-center justify-between px-1">
        <RowOpenHint />
        {typeof total === 'number' && !isPending ? (
          <p className="text-xs">
            {filtered
              ? `${rows.length.toLocaleString()} shown`
              : `${total.toLocaleString()} in total`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
