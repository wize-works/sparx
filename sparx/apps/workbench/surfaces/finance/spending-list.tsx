'use client';

// SPENDING — everything the business paid for, and what it adds up to.
//
// This is the surface people live in, so the bar is entry speed: someone with a
// stack of receipts should be able to record one in seconds and get straight to
// the next. That shapes two decisions here.
//
// QUICK ENTRY IS INLINE, NOT A TRIP TO THE DETAIL PANE. Amount, what for,
// category — three fields in a row at the top of the list, Enter to save, focus
// returns to the amount. The full pane (allocations, receipts, due dates) is one
// click away for the row that needs it, but the common case never leaves this
// screen. A modal here would be worse than either: it would hide the list you
// are reconciling against.
//
// THE TOTAL IS THE FILTER'S, NOT THE PAGE'S. `totalCents` comes from the server
// over the whole matching set, so scrolling never moves it. A total that counted
// only loaded rows would be a number that quietly changes as you look at it.
//
// Color carries the two things a row is: its category's KIND (cost of the work
// / wages / running costs — three hues that have to separate at a glance) and
// whether it has been PAID. Those are different questions, so they are different
// axes — the kind rides the category badge, the state rides its own.

import { useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Heading,
  Input,
  NativeSelect,
  SearchInput,
  Table,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Plus, Receipt, Wallet } from 'lucide-react';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterPaneChange } from '../../lib/defer';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  parseMoneyToCents,
  spendErrorMessage,
  useExpenseCategories,
  useExpenses,
  useSaveExpense,
  useVendors,
  type Expense,
} from './spend-data';
import { PERIOD_OPTIONS, rangeFor, type PeriodKey } from './period';
import { billState, formatCents, formatDay, kindColor, sourceLabel } from './format';
import { RowOpenHint } from '../../components/row-open-hint';

const PAID_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unpaid', label: 'Not yet paid' },
  { value: 'paid', label: 'Paid' },
] as const;

const PAGE = 50;
const MAX_ROWS = 200;

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/* ── Quick entry ────────────────────────────────────────────────────────────
 *
 * Three fields and a button. Everything else an expense can carry has a sensible
 * default (today, unpaid, no vendor), and a person entering a shoebox of
 * receipts should not be asked about any of it.
 */

function QuickEntry({
  categories,
  onOpenFull,
}: {
  categories: { id: string; name: string; kind: 'cost_of_sale' | 'labor' | 'operating' }[];
  onOpenFull: () => void;
}) {
  const toast = useToast();
  const save = useSaveExpense('new');
  const amountRef = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const amountCents = parseMoneyToCents(amount);
  const canSave =
    amountCents !== null && amountCents > 0 && description.trim() !== '' && categoryId !== '';

  const submit = () => {
    if (!canSave || amountCents === null) return;
    save.mutate(
      {
        categoryId,
        vendorId: null,
        description: description.trim(),
        amountCents,
        currency: 'USD',
        taxCents: 0,
        // The day the cost belongs to. Typing a receipt in on Tuesday for a
        // Saturday purchase is what the full pane is for; the common case is
        // today, and asking every time would cost more than it saves.
        incurredAt: new Date().toISOString(),
        paidAt: null,
        dueAt: null,
        paymentMethod: null,
        reference: null,
        notes: null,
        allocations: [],
        attachmentAssetIds: [],
      },
      {
        onSuccess: () => {
          setAmount('');
          setDescription('');
          // The category deliberately STAYS. A run of receipts is usually a run
          // of the same kind of thing, and re-picking "Fuel" nine times is the
          // friction this whole row exists to remove.
          amountRef.current?.focus();
          afterPaneChange(() => {
            toast.add({ title: 'Cost recorded', type: 'success' });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not record that cost',
            description: spendErrorMessage(error, 'Nothing was saved.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <Card className="p-3">
      <div className="flex flex-col gap-2 @2xl:flex-row @2xl:items-center">
        <Input
          ref={amountRef}
          color="module"
          size="sm"
          inputMode="decimal"
          value={amount}
          placeholder="0.00"
          aria-label="Amount"
          className="text-right tabular-nums @2xl:w-28"
          onChange={(event) => {
            setAmount(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <Input
          color="module"
          size="sm"
          value={description}
          placeholder="What was it for?"
          aria-label="What was it for"
          className="min-w-0 flex-1"
          onChange={(event) => {
            setDescription(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
        <NativeSelect
          color="module"
          size="sm"
          value={categoryId}
          aria-label="Category"
          className="@2xl:w-48"
          onChange={(event) => {
            setCategoryId(event.target.value);
          }}
        >
          <option value="">Choose a category…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </NativeSelect>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            color="module"
            disabled={!canSave}
            loading={save.isPending}
            onClick={submit}
          >
            <Plus className="size-4" aria-hidden />
            Record
          </Button>
          <Button size="sm" variant="ghost" color="neutral" onClick={onOpenFull}>
            More detail
          </Button>
        </div>
      </div>
      {amount.trim() !== '' && amountCents === null ? (
        <Text className="mt-2 text-sm">
          That amount is not a number we can read. Try something like 42.50.
        </Text>
      ) : null}
    </Card>
  );
}

/* ── One row ────────────────────────────────────────────────────────────────*/

function ExpenseRow({
  item,
  onOpen,
}: {
  item: Expense;
  onOpen: (event: { shiftKey: boolean; altKey: boolean }) => void;
}) {
  const state = billState(item.paidAt, item.dueAt);
  return (
    <tr
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(event);
      }}
    >
      <td className="text-sm whitespace-nowrap">{formatDay(item.incurredAt)}</td>
      <td className="max-w-56 min-w-0">
        <div className="truncate font-medium">{item.description}</div>
        {item.vendor ? <div className="truncate text-sm">{item.vendor.name}</div> : null}
      </td>
      <td className="hidden @lg:table-cell">
        {item.category ? (
          <Badge color={kindColor(item.category.kind)} variant="soft" size="sm">
            {item.category.name}
          </Badge>
        ) : null}
      </td>
      <td className="hidden @2xl:table-cell">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
      </td>
      <td className="hidden text-sm @4xl:table-cell">
        {item.source === 'manual' ? null : sourceLabel(item.source)}
      </td>
      <td className="text-right font-medium tabular-nums">
        {formatCents(item.amountCents, item.currency)}
      </td>
    </tr>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────────*/

export function SpendingListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [paid, setPaid] = useState<string>('all');
  const [categoryId, setCategoryId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const range = useMemo(() => rangeFor(period), [period]);
  const categories = useExpenseCategories();
  const vendors = useVendors();

  const filters = {
    ...(period === 'all' ? {} : { from: range.from, to: range.to }),
    ...(categoryId ? { categoryId } : {}),
    ...(vendorId ? { vendorId } : {}),
    ...(paid === 'unpaid' ? { unpaidOnly: true } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
    limit,
  };

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useExpenses(filters);

  // `unpaidOnly: false` would mean "only paid" server-side, but the schema's
  // nullish boolean makes "all" and "paid" indistinguishable over a query
  // string, so the paid-only case narrows here. It is the rare filter, and it
  // only ever hides rows the server already sent.
  const rows = useMemo(() => {
    const items = data?.items ?? [];
    return paid === 'paid' ? items.filter((item) => item.paidAt !== null) : items;
  }, [data?.items, paid]);

  const isFiltered = search.trim() !== '' || categoryId !== '' || vendorId !== '' || paid !== 'all';
  const hasMore = data?.nextCursor !== null && limit < MAX_ROWS;

  const clearFilters = () => {
    setSearch('');
    setCategoryId('');
    setVendorId('');
    setPaid('all');
    setLimit(PAGE);
  };

  const open = (item: Expense, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('finance.expense.detail', { id: item.id }, { target: targetFor(event) });
  };

  const openNew = () => {
    ctx.open('finance.expense.detail', { id: 'new' }, { target: 'tab' });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Spending list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search what you spent on, a reference, or a supplier"
              placeholder="Search costs…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                setLimit(PAGE);
              }}
            />
          </div>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              color="module"
              value={period}
              aria-label="Period"
              onChange={(event) => {
                setPeriod(event.target.value as PeriodKey);
                setLimit(PAGE);
              }}
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              color="module"
              value={categoryId}
              aria-label="Filter by category"
              onChange={(event) => {
                setCategoryId(event.target.value);
                setLimit(PAGE);
              }}
            >
              <option value="">Every category</option>
              {(categories.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              color="module"
              value={vendorId}
              aria-label="Filter by who you paid"
              onChange={(event) => {
                setVendorId(event.target.value);
                setLimit(PAGE);
              }}
            >
              <option value="">Everyone you pay</option>
              {(vendors.data ?? []).map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </NativeSelect>
            <Filter
              color="module"
              value={paid}
              onValueChange={(next) => {
                setPaid(typeof next === 'string' ? next : 'all');
                setLimit(PAGE);
              }}
              showReset={false}
              aria-label="Filter by whether it has been paid"
            >
              {PAID_FILTERS.map((filter) => (
                <FilterItem key={filter.value} value={filter.value}>
                  {filter.label}
                </FilterItem>
              ))}
            </Filter>
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <EmptyState
            icon={<Wallet className="size-6" aria-hidden />}
            title="Could not load your spending"
            description="The server could not be reached. Nothing you have recorded is affected — try again in a moment."
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
        ) : isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
            {/* The headline: what this filter adds up to, over the whole matching
                set rather than the loaded page. */}
            <Card className="p-4">
              <Text className="text-sm">
                {period === 'all' ? 'Total spending' : `Spending · ${periodLabel(period)}`}
              </Text>
              <Heading level={2} className="mt-1 text-3xl font-semibold tabular-nums">
                {formatCents(data.totalCents)}
              </Heading>
              <Text className="mt-1 text-sm">
                {rows.length === 1 ? '1 cost' : `${String(rows.length)} costs`}
                {hasMore ? ' loaded so far' : ''}
                {isFiltered ? ' matching these filters' : ''}
              </Text>
            </Card>

            {(categories.data ?? []).length > 0 ? (
              <QuickEntry categories={categories.data ?? []} onOpenFull={openNew} />
            ) : null}

            {rows.length === 0 ? (
              <Card>
                <ListEmptyState
                  filtered={isFiltered}
                  noResults={{
                    icon: <Receipt className="size-6" aria-hidden />,
                    title: 'No costs match those filters',
                    description:
                      'Try a wider period, or clear the filters to see everything you have recorded.',
                    actions: (
                      <Button size="sm" variant="outline" color="neutral" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ),
                  }}
                  firstRun={{
                    icon: <Receipt className="size-6" aria-hidden />,
                    title: 'Nothing recorded yet',
                    description:
                      'Record what the business pays for — parts, wages, rent, software, fuel — and it will be counted against what you earn. Use the row above for a quick one, or open the full form for a bill with a due date and a receipt.',
                    actions: (
                      <Button size="sm" color="module" onClick={openNew}>
                        <Plus className="size-4" aria-hidden />
                        Record a cost
                      </Button>
                    ),
                  }}
                />
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <Table size="sm" hover>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>What for</th>
                      <th className="hidden @lg:table-cell">Category</th>
                      <th className="hidden @2xl:table-cell">State</th>
                      <th className="hidden @4xl:table-cell">Where from</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <ExpenseRow
                        key={item.id}
                        item={item}
                        onOpen={(event) => {
                          open(item, event);
                        }}
                      />
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}

            {hasMore ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                loading={isFetching}
                onClick={() => {
                  setLimit((current) => Math.min(current + PAGE, MAX_ROWS));
                }}
              >
                Show more
              </Button>
            ) : null}

            {rows.length > 0 ? <RowOpenHint what="a cost to open it" /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function periodLabel(period: PeriodKey): string {
  return PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? '';
}
