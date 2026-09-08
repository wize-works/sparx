'use client';

// Your products, and which languages each one is written in.
//
// A worklist: the question it answers is "what still needs translating", so
// every row carries its coverage — the languages already authored, or a plain
// "Not translated". Click a row to open that product's translation editor.
//
// It is registered under Content (localization is a content concern) but the
// thing it works on is a COMMERCE product, so the whole surface wears the
// commerce hue via <ModuleScope module="commerce">: the pane's chrome stays
// Content-teal, the content it holds reads as commerce-orange, which is the
// color-follows-functionality rule made literal.
//
// A table, because the rows are genuinely tabular — same three facts each
// (what it is, whether it's on sale, what it's translated into) — and people
// scan DOWN the coverage column for the gaps. Search + paging are server-side;
// coverage is fetched per visible row (see useCoverage) because the products
// list endpoint carries no translation join.

import { useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  SearchInput,
  Table,
} from '@wizeworks/silicaui-react';
import { Languages } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { ModuleScope } from '../../components/module-scope';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import {
  useCoverage,
  useTranslatableProducts,
  type ProductStatus,
  type TranslatableProduct,
} from './translations-data';
import { TranslationRow } from './translation-row';
import { RowOpenHint } from '../../components/row-open-hint';

/** The status chips ARE questions someone opens this list to answer. Each maps
 *  to a server-side filter, never a browser sieve over the loaded page. */
const STATUS_FILTERS = [
  { value: 'all', label: 'All', status: undefined, includeArchived: false },
  { value: 'active', label: 'On sale', status: 'active', includeArchived: false },
  { value: 'draft', label: 'Drafts', status: 'draft', includeArchived: false },
  { value: 'archived', label: 'Retired', status: 'archived', includeArchived: true },
] as const satisfies readonly {
  value: string;
  label: string;
  status: ProductStatus | undefined;
  includeArchived: boolean;
}[];

type StatusFilterValue = (typeof STATUS_FILTERS)[number]['value'];

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function TranslationsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');

  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(25);

  const active = STATUS_FILTERS.find((entry) => entry.value === statusFilter) ?? STATUS_FILTERS[0];
  const skip = (page - 1) * pageSize;
  const narrowed = statusFilter !== 'all' || search.trim() !== '';

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useTranslatableProducts({
    q: search.trim(),
    ...(active.status ? { status: active.status } : {}),
    includeArchived: active.includeArchived,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  // Coverage for the rows on screen — one light, cached request each, shared
  // with the editor's own read. Bounded by the page, so a bigger page is a
  // deliberate cost the operator chose with the size picker.
  const { byProduct, loading: coverageLoading } = useCoverage(rows.map((row) => row.id));

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const open = (product: TranslatableProduct, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('cms.translations.detail', { id: product.id }, { target: targetFor(event) });
  };

  return (
    <ModuleScope module="commerce" className={PANE_SHELL}>
      <PaneToolbar
        label="Product translations controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search products"
              placeholder="Product name or web address…"
              value={search}
              onValueChange={(next) => {
                setSearch(next);
                resetWindow();
              }}
            />
          </div>
        }
        controls={
          <>
            <Filter
              color="module"
              value={statusFilter}
              onValueChange={(next) => {
                setStatusFilter((next as StatusFilterValue | null) ?? 'all');
                resetWindow();
              }}
              showReset={false}
              aria-label="Filter by status"
              className="ml-auto"
            >
              {STATUS_FILTERS.map((entry) => (
                <FilterItem key={entry.value} value={entry.value}>
                  {entry.label}
                </FilterItem>
              ))}
            </Filter>
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
        {error ? (
          // A failed load REPLACES the table — "no products yet" over a
          // connection failure is a lie about their catalogue.
          <EmptyState
            icon={<Languages className="size-6" aria-hidden />}
            title="Could not load your products"
            description="This is a problem reaching the server. Nothing you have written or translated is affected — none of it has been lost."
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
          <EmptyState
            icon={<Languages className="size-6" aria-hidden />}
            title={narrowed ? 'Nothing matches that' : 'No products to translate yet'}
            description={
              narrowed
                ? 'Try part of the product name, or widen the filter to see the rest of your catalogue.'
                : 'Once you add a product, this is where you translate its name and description into the other languages your customers read.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Product</th>
                <th className="hidden @2xl:table-cell">Status</th>
                <th className="hidden @4xl:table-cell">Last translated</th>
                <th>Languages</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <TranslationRow
                  key={product.id}
                  product={product}
                  languages={byProduct.get(product.id)}
                  coverageLoading={coverageLoading}
                  onOpen={open}
                />
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="shrink-0">
        <ListPagination
          shown={rows.length}
          firstRow={rows.length === 0 ? 0 : skip + 1}
          total={total}
          page={page}
          pageSize={pageSize}
          canLoadMore={take < MAX_TAKE}
          busy={isFetching}
          onLoadMore={() => {
            setTake((current) => Math.min(current + pageSize, MAX_TAKE));
          }}
          onPageChange={(next) => {
            setPage(next);
            setTake(pageSize);
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
        <RowOpenHint />
      </div>
    </ModuleScope>
  );
}
