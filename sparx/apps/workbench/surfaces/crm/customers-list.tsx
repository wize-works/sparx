'use client';

// The customers list — everyone in the address book.
//
// A customer is a multi-attribute record, not a one-line thing: who they are,
// what kind of relationship it is, and what they are worth. That earns a table —
// each column answers a different question the owner scans across. The two the
// list is really FOR are lifetime value and how recently they last bought, so
// those sort the list and sit on the right where the eye lands.

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
} from '@wizeworks/silicaui-react';
import { Plus, Users } from 'lucide-react';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import { SavedViewsMenu, viewFilterValue, viewFilters } from './saved-views-menu';
import { scoreBand, useActiveScoringModel } from './scoring-data';
import type { SavedView } from './workspace-data';
import {
  LIFECYCLE_STAGES,
  RELATIONSHIP_TYPES,
  customerName,
  customerTypeMeta,
  formatMoney,
  lifecycleStageMeta,
  useCustomers,
  type Customer,
  type CustomerSort,
  type CustomerType,
  type LifecycleStage,
} from './customers-data';
import { RowOpenHint } from '../../components/row-open-hint';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** A short, human date for the "last order" column — or a plain dash. */
function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const SORTS: { value: CustomerSort; label: string }[] = [
  { value: 'lastOrderAt', label: 'Recent order' },
  { value: 'totalSpent', label: 'Total spent' },
  { value: 'updatedAt', label: 'Recently changed' },
  { value: 'createdAt', label: 'Newest added' },
];

/**
 * The score column and its sort exist only once the business has set scoring up.
 *
 * "Who should I call first" is the question a score is FOR, and before this the
 * answer was unreachable: the number was computed, stored and invisible. But a
 * column of zeros on a tenant that never wrote a rule is worse than no column —
 * it invents a ranking out of an unconfigured feature. So the column appears
 * when the number starts meaning something, and not before.
 */
const SCORE_SORT: { value: CustomerSort; label: string } = {
  value: 'score',
  label: 'Best score first',
};

export function CustomersListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<'all' | LifecycleStage>('all');
  const [type, setType] = useState<'all' | CustomerType>('all');
  const [sortBy, setSortBy] = useState<CustomerSort>('lastOrderAt');
  // Which saved view is showing, or null for the whole list. A view SETS the
  // filters and then stops being involved — changing one afterwards simply means
  // the current choices differ from the saved ones, which is what re-enables
  // "save these filters".
  const [viewId, setViewId] = useState<string | null>(null);

  // This list's controls in the platform's condition DSL, on the field paths the
  // resolvers already publish — so a view saved here reads the same as a segment
  // or a report condition written on the same fields.
  const currentFilters = viewFilters([
    search.trim() !== '' && {
      field: 'customer.search',
      operator: 'contains',
      value: search.trim(),
    },
    stage !== 'all' && { field: 'customer.lifecycleStage', operator: 'eq', value: stage },
    type !== 'all' && { field: 'customer.type', operator: 'eq', value: type },
  ]);

  const applyView = (view: SavedView | null): void => {
    setViewId(view?.id ?? null);
    setSearch(viewFilterValue(view, 'customer.search'));
    const nextStage = viewFilterValue(view, 'customer.lifecycleStage');
    setStage(nextStage === '' ? 'all' : (nextStage as LifecycleStage));
    const nextType = viewFilterValue(view, 'customer.type');
    setType(nextType === '' ? 'all' : (nextType as CustomerType));
    setSortBy((view?.sort?.field ?? 'lastOrderAt') as CustomerSort);
  };

  useEffect(() => {
    ctx.setTitle('Customers');
  }, [ctx]);

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useCustomers({
    q: search,
    lifecycleStage: stage === 'all' ? undefined : stage,
    type: type === 'all' ? undefined : type,
    sortBy,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const filtered = search.trim() !== '' || stage !== 'all' || type !== 'all';

  // Two independent filters (docs/137): lifecycle stage (where they are) and
  // relationship (how they buy). Stage is the primary one, so it survives longest
  // as the pane narrows.
  const stageItems = useMemo(() => {
    const items: Record<string, string> = { all: 'Any stage' };
    for (const s of LIFECYCLE_STAGES) items[s] = lifecycleStageMeta(s).label;
    return items;
  }, []);

  const typeItems = useMemo(() => {
    const items: Record<string, string> = { all: 'Any type' };
    for (const t of RELATIONSHIP_TYPES) items[t] = customerTypeMeta(t).label;
    return items;
  }, []);

  const scoringModel = useActiveScoringModel('contact');
  const scored = scoringModel !== null;

  const sortItems = useMemo(() => {
    const items: Record<string, string> = {};
    // Ranked first when it exists, because it is the one sort that answers "who
    // do I call first" rather than "what happened most recently".
    if (scored) items[SCORE_SORT.value] = SCORE_SORT.label;
    for (const s of SORTS) items[s.value] = s.label;
    return items;
  }, [scored]);

  const open = (customer: Customer, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('crm.customer.detail', { id: customer.id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Customer list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              color="module"
              size="sm"
              aria-label="Search customers"
              placeholder="Search name, company or email…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primary={
          <Button
            data-tour="crm-add-customer"
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            title="Add a customer — hold Shift to open alongside, Alt for a new window"
            onClick={(event) => {
              ctx.open('crm.customer.detail', { id: 'new' }, { target: targetFor(event) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add a customer
          </Button>
        }
        controls={
          <>
            {/* Filters hide as the pane narrows — search is used constantly, these
            occasionally; lifecycle stage (the primary signal) outlives the rest. */}
            <div className="hidden w-40 shrink-0 @md:block">
              <Select
                color="module"
                size="sm"
                aria-label="Filter by lifecycle stage"
                value={stage}
                items={stageItems}
                onValueChange={(next) => {
                  setStage(next as 'all' | LifecycleStage);
                }}
              />
            </div>
            <div className="hidden w-36 shrink-0 @lg:block">
              <Select
                color="module"
                size="sm"
                aria-label="Filter by relationship type"
                value={type}
                items={typeItems}
                onValueChange={(next) => {
                  setType(next as 'all' | CustomerType);
                }}
              />
            </div>
            <div className="hidden w-40 shrink-0 @xl:block">
              <Select
                color="module"
                size="sm"
                aria-label="Sort customers by"
                value={sortBy}
                items={sortItems}
                onValueChange={(next) => {
                  setSortBy(next as CustomerSort);
                }}
              />
            </div>
            <SavedViewsMenu
              objectKey="contact"
              current={currentFilters}
              baseline={viewFilters([])}
              sort={{ field: sortBy, direction: 'desc' }}
              nameHint="New enquiries"
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
            icon={<Users className="size-6" aria-hidden />}
            title="Could not load your customers"
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
              icon: <Users className="size-6" aria-hidden />,
              title: 'Nobody matches those filters',
              description:
                'Try a different word, or clear the filters to see everyone. Someone you expect to see may be filed under a different kind.',
            }}
            firstRun={{
              title: 'No customers yet',
              description:
                'Everyone who buys from you or gets added by hand appears here. Add your first customer to get started.',
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Name</th>
                <th className="hidden @md:table-cell">Company</th>
                <th>Stage</th>
                {scored ? <th className="text-right">Score</th> : null}
                <th className="text-right">Total spent</th>
                <th className="hidden text-right @lg:table-cell">Last order</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const stageMeta = lifecycleStageMeta(row.lifecycleStage);
                const typeMeta = customerTypeMeta(row.type);
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
                    <td>
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">{customerName(row)}</span>
                        {/* Relationship rides the name only when it's noteworthy —
                            a plain retail individual is the unremarkable default. */}
                        {row.type !== 'retail' ? (
                          <Badge color={typeMeta.color} variant="soft" size="sm">
                            {typeMeta.label}
                          </Badge>
                        ) : null}
                      </span>
                      {row.email && customerName(row) !== row.email ? (
                        <span className="block text-sm">{row.email}</span>
                      ) : null}
                    </td>
                    <td className="hidden @md:table-cell">{row.company ?? '—'}</td>
                    <td>
                      <Badge color={stageMeta.color} variant="soft" size="sm">
                        {stageMeta.label}
                      </Badge>
                    </td>
                    {scored ? (
                      <td className="text-right">
                        {/* The band, not a bare number: a business owner acts on
                            "Hot" and never on 61-versus-64. The figure rides
                            along for whoever does want to compare two.

                            ZERO GETS A DASH, NOT A BADGE. Most people score zero
                            on a young model, and a badge on every one of them is
                            a wall of grey that buries the two rows worth looking
                            at — the exact opposite of what a score column is for.
                            A badge here means "this one has points". */}
                        {row.score > 0 ? (
                          <Badge
                            color={scoreBand(row.score, scoringModel.maxScore).color}
                            variant="soft"
                            size="sm"
                          >
                            {row.score} · {scoreBand(row.score, scoringModel.maxScore).label}
                          </Badge>
                        ) : (
                          <span className="text-sm">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="text-right font-mono text-sm tabular-nums">
                      {formatMoney(row.totalSpent)}
                    </td>
                    <td className="hidden text-right text-sm @lg:table-cell">
                      {shortDate(row.lastOrderAt)}
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
