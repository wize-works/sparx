'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../utils/cn';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { EmptyState } from './empty-state';

// Generic TanStack-backed table with built-in sorting/pagination/filtering
// hooks. Consumers define columns; this component renders the chrome,
// keyboard a11y, and empty/loading states.

export interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  /** Disable client-side pagination (you're doing server-side instead). */
  manualPagination?: boolean;
  /** Initial page size for client-side pagination. Default 25. */
  pageSize?: number;
  emptyState?: React.ReactNode;
  className?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  manualPagination = false,
  pageSize = 25,
  emptyState,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
    manualPagination,
    initialState: { pagination: { pageSize } },
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            'inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider',
                            'transition-colors duration-150 hover:text-[var(--color-text-primary)]',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] focus-visible:rounded-sm',
                            sortDir
                              ? 'text-[var(--color-text-primary)]'
                              : 'text-[var(--color-text-tertiary)]'
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sortDir === 'asc' ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : sortDir === 'desc' ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-50" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() ? 'selected' : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="p-0">
                  {emptyState ?? (
                    <EmptyState title="No results" description="Try adjusting your filters." />
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {!manualPagination && rows.length > 0 && (
        <DataTablePager
          page={table.getState().pagination.pageIndex + 1}
          pageCount={Math.max(table.getPageCount(), 1)}
          totalRows={table.getFilteredRowModel().rows.length}
          onPrev={() => table.previousPage()}
          onNext={() => table.nextPage()}
          canPrev={table.getCanPreviousPage()}
          canNext={table.getCanNextPage()}
        />
      )}
    </div>
  );
}

function DataTablePager({
  page,
  pageCount,
  totalRows,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  page: number;
  pageCount: number;
  totalRows: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-1 text-xs text-[var(--color-text-secondary)]">
      <span>
        {totalRows.toLocaleString()} {totalRows === 1 ? 'row' : 'rows'}
      </span>
      <div className="flex items-center gap-2">
        <span>
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className={cn(
            'rounded-sm border border-[var(--color-border-default)] px-2 py-1',
            'transition-colors duration-150',
            'hover:bg-[var(--color-bg-subtle)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent'
          )}
        >
          Prev
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className={cn(
            'rounded-sm border border-[var(--color-border-default)] px-2 py-1',
            'transition-colors duration-150',
            'hover:bg-[var(--color-bg-subtle)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]',
            'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent'
          )}
        >
          Next
        </button>
      </div>
    </div>
  );
}
