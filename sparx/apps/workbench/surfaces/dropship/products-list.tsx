'use client';

// Supplier products — what your suppliers offer, and which of it you sell.
//
// Two jobs on one surface, because they are the same list at different stages:
// BROWSING a supplier's catalog to import something new, and MANAGING what you
// have already imported. A filter switches between them, so opening the pane
// from a supplier ("browse products") and from the nav ("what have I listed")
// land in the same place with the right rows.
//
// A standard list surface like invoicing: a real <Table> with a thumbnail column
// (a product table legitimately keeps one), sortable headers backed by
// SERVER-SIDE sort, and server-side paging via <ListPagination>. It is driven by
// the cross-supplier `GET /v1/dropship/products` aggregate — ONE server-paged,
// server-sorted, server-filtered query — not a client fan-out across every
// supplier's catalog (which would sort and page a merged window by hand, a wrong
// answer the moment it pages). `{ supplierId }` scopes it to one supplier.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Select,
  Table,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ArrowDown, ArrowUp, Package, PackagePlus, RefreshCcw } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import {
  dropshipErrorMessage,
  formatCents,
  importState,
  useDropshipProducts,
  useImportProduct,
  useReimportProduct,
  useSuppliers,
  type AggregateProduct,
  type ProductSort,
  type SortDir,
} from './dropship-data';
import { RowOpenHint } from '../../components/row-open-hint';

type StatusFilter = 'all' | 'imported' | 'available';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/* ── One product row ────────────────────────────────────────────────────── */

function ProductRow({
  product,
  ctx,
  showSupplier,
}: {
  product: AggregateProduct;
  ctx: SurfaceContext;
  showSupplier: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const importer = useImportProduct(product.supplierId);
  const reimport = useReimportProduct(product.supplierId);

  const state = importState(product);
  const commerceProductId = product.links[0]?.productId ?? null;

  const onImport = () => {
    importer.mutate(product.id, {
      onSuccess: (result) => {
        toast.add({
          title: `${product.title} imported`,
          description: `Added to your catalog as a draft with ${
            result.variantCount === 1 ? '1 version' : `${String(result.variantCount)} versions`
          }. Open it to set a price and put it on sale.`,
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not import that product',
          description: dropshipErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onReimport = (event: React.MouseEvent) => {
    event.stopPropagation();
    void (async () => {
      const ok = await confirm({
        title: `Pull ${product.title} from ${product.supplierName} again?`,
        description:
          'Their current stock availability is re-applied, and their photos are added if your product has none. This does not overwrite a price or description you have already set. Continue?',
        confirmLabel: 'Pull it again',
        cancelLabel: 'Leave it as it is',
        color: 'warning',
      });
      if (!ok) return;
      reimport.mutate(product.id, {
        onSuccess: () => {
          toast.add({ title: `Refreshed from ${product.supplierName}`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not pull it again',
            description: dropshipErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    })();
  };

  const openProduct = (event: { shiftKey: boolean; altKey: boolean }) => {
    if (!commerceProductId) return;
    ctx.open('commerce.product.detail', { id: commerceProductId }, { target: targetFor(event) });
  };

  const clickable = product.isImported && commerceProductId !== null;

  return (
    <tr
      className={clickable ? 'cursor-pointer' : undefined}
      tabIndex={clickable ? 0 : undefined}
      role={clickable ? 'button' : undefined}
      onClick={clickable ? (event) => openProduct(event) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              openProduct(event);
            }
          : undefined
      }
    >
      <td className="w-10">
        {product.images[0] ? (
          // A hot-linked supplier thumbnail on an arbitrary external CDN — not an
          // allow-listed media host, so `next/image` would reject it. Decorative
          // (the title is the label), so empty alt is correct.
          <img src={product.images[0]} alt="" className="bg-base-200 size-8 rounded object-cover" />
        ) : (
          <span className="bg-base-200 flex size-8 items-center justify-center rounded" aria-hidden>
            <Package className="size-4" />
          </span>
        )}
      </td>
      <td className="max-w-56 truncate font-medium">{product.title}</td>
      {showSupplier ? (
        <td className="hidden max-w-40 truncate @lg:table-cell">{product.supplierName}</td>
      ) : null}
      <td className="hidden text-right tabular-nums @xl:table-cell">
        {formatCents(product.costPriceCents)}
      </td>
      <td>
        {state ? (
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
        ) : (
          <Text as="span" className="text-sm">
            Not imported
          </Text>
        )}
      </td>
      <td className="text-right">
        {product.isImported ? (
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label={`Refresh ${product.title} from the supplier`}
            title="Pull the latest availability and photos from the supplier"
            loading={reimport.isPending}
            onClick={onReimport}
          >
            <RefreshCcw className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button size="sm" color="module" loading={importer.isPending} onClick={onImport}>
            <PackagePlus className="size-4" aria-hidden />
            Import
          </Button>
        )}
      </td>
    </tr>
  );
}

/* ── Surface ────────────────────────────────────────────────────────────── */

export function DropshipProductsListSurface({ ctx }: { ctx: SurfaceContext }) {
  const paramSupplier = typeof ctx.params.supplierId === 'string' ? ctx.params.supplierId : '';

  const suppliers = useSuppliers();
  const supplierList = suppliers.data?.items ?? [];

  const [supplierFilter, setSupplierFilter] = useState<string>(paramSupplier || 'all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: ProductSort; dir: SortDir }>({
    key: 'title',
    dir: 'asc',
  });

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useDropshipProducts({
    supplierId: supplierFilter === 'all' ? undefined : supplierFilter,
    status: statusFilter === 'all' ? undefined : statusFilter,
    q: search,
    sortBy: sort.key,
    order: sort.dir,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;

  const noSuppliers = !suppliers.isPending && supplierList.length === 0;
  const showSupplierColumn = supplierFilter === 'all' && supplierList.length > 1;
  const anyFilter = search.trim() !== '' || statusFilter !== 'all' || supplierFilter !== 'all';

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const toggleSort = (key: ProductSort) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'costPriceCents' || key === 'importedAt' ? 'desc' : 'asc' }
    );
    resetWindow();
  };

  const header = (key: ProductSort, label: string, extra = '') => (
    <th
      className={extra}
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="link link-hover inline-flex items-center gap-1"
        onClick={() => {
          toggleSort(key);
        }}
      >
        {label}
        {sort.key === key ? (
          sort.dir === 'asc' ? (
            <ArrowUp className="size-3" aria-hidden />
          ) : (
            <ArrowDown className="size-3" aria-hidden />
          )
        ) : null}
      </button>
    </th>
  );

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Supplier products controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search supplier products"
              placeholder="Search products…"
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
            {supplierList.length > 1 ? (
              <div className="hidden w-44 shrink-0 @2xl:block">
                <Select
                  size="sm"
                  aria-label="Which supplier"
                  value={supplierFilter}
                  items={{
                    all: 'All suppliers',
                    ...Object.fromEntries(supplierList.map((s) => [s.id, s.name])),
                  }}
                  onValueChange={(next) => {
                    setSupplierFilter(next as string);
                    resetWindow();
                  }}
                />
              </div>
            ) : null}
            <div className="hidden w-40 shrink-0 @md:block">
              <Select
                size="sm"
                aria-label="Show which products"
                value={statusFilter}
                items={{
                  all: 'All products',
                  imported: 'In your catalog',
                  available: 'Not imported yet',
                }}
                onValueChange={(next) => {
                  setStatusFilter(next as StatusFilter);
                  resetWindow();
                }}
              />
            </div>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching || suppliers.isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
              void suppliers.refetch();
            }}
          />
        }
      />

      <Card className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <EmptyState
            icon={<Package className="size-6" aria-hidden />}
            title="Could not load supplier products"
            description="Something went wrong reaching the server. Try again in a moment."
          />
        ) : noSuppliers ? (
          <EmptyState
            icon={<Package className="size-6" aria-hidden />}
            title="No suppliers connected"
            description="Supplier products appear once you connect a supplier and sync its catalog. Connect one to start importing products to sell."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={(event) => {
                  ctx.open('dropship.supplier.detail', { id: 'new' }, { target: targetFor(event) });
                }}
              >
                Connect a supplier
              </Button>
            }
          />
        ) : isLoading ? (
          <p className="p-4 text-sm" role="status">
            Loading products…
          </p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Package className="size-6" aria-hidden />}
            title={anyFilter ? 'No products match those filters' : 'Nothing in this catalog yet'}
            description={
              anyFilter
                ? 'Try a different word, or switch the filters back to All.'
                : 'Sync a supplier from its page to pull its catalog in. Once it has synced, its products show here ready to import.'
            }
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th className="w-10">
                  <span className="sr-only">Image</span>
                </th>
                {header('title', 'Product')}
                {showSupplierColumn ? <th className="hidden @lg:table-cell">Supplier</th> : null}
                {header('costPriceCents', 'Cost', 'hidden text-right @xl:table-cell')}
                <th>State</th>
                <th className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => (
                <ProductRow
                  key={`${product.supplierId}:${product.id}`}
                  product={product}
                  ctx={ctx}
                  showSupplier={showSupplierColumn}
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
        <Text className="hidden shrink-0 px-1 text-sm @md:block">
          Import a product to add it to your catalog.
        </Text>
        <RowOpenHint what="an imported product to open it" />
      </div>
    </div>
  );
}
