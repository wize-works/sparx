'use client';

// BARCODES — every code that resolves to something you sell.
//
// ── This screen exists to answer one question: can we scan yet ────────────
//
// Not "list some rows". A warehouse can only go scan-first when every item has a
// code, and the two things standing between a tenant and that are always the
// same: items with no barcode at all, and codes that two items both claim. Both
// are surfaced at the top as counts you can act on, because a registry that
// merely LISTS what is already right is a screen nobody opens twice.
//
// ── Pack size is a first-class column ─────────────────────────────────────
//
// It is the one field here with consequences on the floor: a case code with a
// pack size of one turns every delivery into a quiet undercount, and nothing
// about it appears anywhere else. So it gets a column, and a value above one
// gets color.

import { useState } from 'react';
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  SearchInput,
  Table,
  Text,
  Timestamp,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
} from '@wizeworks/silicaui-react';
import { Barcode, CircleAlert, Printer, Search, Sparkles } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { plural } from './data';
import {
  useBarcodeConflicts,
  useBarcodes,
  useSetPrimaryBarcode,
  type Barcode as BarcodeRow,
} from './scan-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** Where a code came from, in words, and what color that fact deserves.
 *  `generated` is ours to reprint; everything else came from outside and is not. */
function sourceLabel(source: string): { label: string; color: string } {
  switch (source) {
    case 'generated':
      return { label: 'Ours', color: 'module-inventory' };
    case 'supplier':
      return { label: 'Supplier', color: 'module-crm' };
    case 'import':
      return { label: 'Imported', color: 'neutral' };
    case 'channel':
      return { label: 'Marketplace', color: 'module-commerce' };
    case 'scan':
      return { label: 'Added by scan', color: 'info' };
    default:
      return { label: 'Typed in', color: 'neutral' };
  }
}

export function BarcodesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;
  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useBarcodes({
    q: search.trim(),
    includeInactive,
    limit: take,
    offset: skip,
  });
  const conflicts = useBarcodeConflicts();
  const setPrimary = useSetPrimaryBarcode();

  const rows = data?.items ?? [];
  const total = data?.total;
  const narrowed = search.trim() !== '' || includeInactive;
  const conflictCount = conflicts.data?.length ?? 0;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const openItem = (row: BarcodeRow, event: { shiftKey: boolean; altKey: boolean }) => {
    if (!row.productId) return;
    ctx.open('commerce.product.detail', { id: row.productId }, { target: targetFor(event) });
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<Barcode className="size-6" aria-hidden />}
          title="Could not load your barcodes"
          description="This is a problem reaching the server. Nothing about your codes has changed — they just could not be read right now."
        />
      );
    }
    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading barcodes…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={
            narrowed ? (
              <Search className="size-6" aria-hidden />
            ) : (
              <Barcode className="size-6" aria-hidden />
            )
          }
          title={narrowed ? 'Nothing matches that' : 'No barcodes registered yet'}
          description={
            narrowed
              ? 'Try part of a code, a SKU, or a product name.'
              : 'A barcode lets someone scan a box instead of typing what is in it. Items that came with a manufacturer code can have it recorded here; anything without one can be given a code of its own, and sparx will print the labels.'
          }
          actions={
            narrowed ? undefined : (
              <Button
                color="module-inventory"
                onClick={() => {
                  ctx.open('inventory.barcodes.labels', {}, { target: 'beside' });
                }}
              >
                <Sparkles className="size-4" aria-hidden />
                Create codes and print labels
              </Button>
            )
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Code</th>
            <th>Item</th>
            <th className="hidden @lg:table-cell">Format</th>
            <th className="text-right">Per scan</th>
            <th className="hidden @xl:table-cell">Where from</th>
            <th className="hidden @2xl:table-cell">Last scanned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const source = sourceLabel(row.source);
            return (
              <tr
                key={row.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  openItem(row, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  openItem(row, event);
                }}
              >
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono font-medium">{row.value}</span>
                    <span className="flex flex-wrap items-center gap-1">
                      {row.isPrimary ? (
                        <Badge color="module-inventory" variant="soft" size="sm">
                          Main code
                        </Badge>
                      ) : (
                        <Tooltip content="Make this the code printed on our own labels">
                          <Button
                            size="xs"
                            variant="outline"
                            color="module-inventory"
                            disabled={setPrimary.isPending}
                            onClick={(event) => {
                              event.stopPropagation();
                              setPrimary.mutate(row.id);
                            }}
                          >
                            Make main
                          </Button>
                        </Tooltip>
                      )}
                      {!row.isActive ? (
                        <Badge color="warning" variant="soft" size="sm">
                          Retired
                        </Badge>
                      ) : null}
                      {row.label ? <Text className="truncate text-sm">{row.label}</Text> : null}
                    </span>
                  </span>
                </td>
                <td className="max-w-48">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{row.productTitle ?? '—'}</span>
                    <span className="truncate font-mono text-sm">{row.sku ?? ''}</span>
                  </span>
                </td>
                <td className="hidden whitespace-nowrap @lg:table-cell">
                  <Badge color="neutral" variant="outline" size="sm">
                    {row.symbologyLabel}
                  </Badge>
                </td>
                <td className="text-right whitespace-nowrap tabular-nums">
                  {/* The field with consequences: a case code that says 1 makes
                      every delivery quietly short. Colored so it is impossible
                      to scan past. */}
                  {row.packSize > 1 ? (
                    <Badge color="module-commerce" size="sm">
                      ×{row.packSize}
                    </Badge>
                  ) : (
                    <Text className="text-sm">1</Text>
                  )}
                </td>
                <td className="hidden @xl:table-cell">
                  <Badge color={source.color} variant="soft" size="sm">
                    {source.label}
                  </Badge>
                  {row.supplierName ? (
                    <Text className="truncate text-sm">{row.supplierName}</Text>
                  ) : null}
                </td>
                <td className="hidden whitespace-nowrap @2xl:table-cell">
                  {row.lastScannedAt ? (
                    <span className="flex flex-col">
                      <Timestamp value={row.lastScannedAt} format="relative" />
                      <Text className="text-sm tabular-nums">
                        {plural(row.scanCount, 'scan', 'scans')}
                      </Text>
                    </span>
                  ) : (
                    <Text className="text-sm">Never</Text>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Barcode list controls"
        search={
          <SearchInput
            value={search}
            placeholder="Code, SKU or product"
            onValueChange={(value) => {
              setSearch(value);
              resetWindow();
            }}
          />
        }
        controls={
          <>
            <Button
              color="module-inventory"
              size="sm"
              onClick={() => {
                ctx.open('inventory.barcodes.labels', {}, { target: 'beside' });
              }}
            >
              <Printer className="size-4" aria-hidden />
              Labels
            </Button>
            <ToggleGroup
              value={includeInactive ? ['retired'] : []}
              onValueChange={(value) => {
                setIncludeInactive(value.includes('retired'));
                resetWindow();
              }}
            >
              <ToggleGroupItem value="retired" aria-label="Include codes that have been retired">
                Include retired
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={dataUpdatedAt}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      {/* The one thing that stops scanning working, if it is happening at all.
          A card rather than a badge in the toolbar: two items claiming one code
          is a data problem someone has to sit down and fix, and it deserves the
          space to say what it means. */}
      {conflictCount > 0 ? (
        <Alert color="danger" variant="soft">
          <CircleAlert className="size-5 shrink-0" aria-hidden />
          <AlertContent>
            <AlertTitle>
              {plural(conflictCount, 'item is', 'items are')} sharing a barcode with something else
            </AlertTitle>
            <AlertDescription>
              A barcode has to point at exactly one thing, or scanning it is a coin toss. These
              codes were left off the scan list until somebody decides which item owns them.
            </AlertDescription>
          </AlertContent>
          <AlertActions>
            <Button
              color="danger"
              size="sm"
              onClick={() => {
                ctx.open('inventory.barcodes.conflicts', {}, { target: 'beside' });
              }}
            >
              Sort them out
            </Button>
          </AlertActions>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>

      {rows.length > 0 ? (
        <ListPagination
          shown={rows.length}
          firstRow={skip + 1}
          total={total}
          page={page}
          pageSize={pageSize}
          canLoadMore={take < MAX_TAKE}
          busy={isFetching}
          onLoadMore={() => {
            setTake((current) => Math.min(current + pageSize, MAX_TAKE));
          }}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setTake(size);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
}
