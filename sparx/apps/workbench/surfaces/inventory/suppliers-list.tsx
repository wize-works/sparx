'use client';

// SUPPLIERS — the businesses you buy from, and what you buy from each.
//
// ── A table, like every other list ────────────────────────────────────────
//
// A supplier is a name and code, a way to reach them, and a couple of default
// terms. Laid down a table those line up into columns you scan, and the list
// reads the same as every other list in the app. The columns disclose with
// @container: docked narrow you see the name, its code and whether it is active;
// given room the contact and the terms come back. The name cell is the one that
// GIVES (`max-w-0 w-full`), so the State badge is never shoved off the right.
//
// ── Two different empties ─────────────────────────────────────────────────
//
// Nothing matches a search · you have not added a supplier yet. Telling someone
// to add their first supplier when they have forty and mistyped a name is the
// worse mistake, so the two are told apart.

import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SearchInput,
  Table,
  ToggleGroup,
  ToggleGroupItem,
} from '@wizeworks/silicaui-react';
import { Archive, Plus, Truck } from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { supplierState, supplierTerms, useSuppliers } from './suppliers-data';

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function SuppliersListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);

  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);

  const skip = (page - 1) * pageSize;

  const { data, isLoading, isFetching, dataUpdatedAt, isError, refetch } = useSuppliers({
    q: search.trim(),
    includeArchived,
    take,
    skip,
  });

  const rows = data?.items ?? [];
  const total = data?.total;
  const searching = search.trim() !== '';

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  const openSupplier = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.suppliers.detail', { id }, { target: targetFor(event) });
  };

  const body = () => {
    if (isError) {
      return (
        <EmptyState
          icon={<Truck className="size-6" aria-hidden />}
          title="Could not load your suppliers"
          description="This is a problem reaching the server. Your suppliers are unaffected — the list just could not be read just now."
        />
      );
    }

    if (isLoading) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading suppliers…
        </p>
      );
    }

    if (rows.length === 0) {
      const addSupplier = (
        <Button
          size="sm"
          color="module"
          onClick={() => {
            ctx.open('inventory.suppliers.detail', { id: 'new' }, { target: 'tab' });
          }}
        >
          <Plus className="size-4" aria-hidden />
          New supplier
        </Button>
      );
      if (searching) {
        return (
          <EmptyState
            icon={<Truck className="size-6" aria-hidden />}
            title="No supplier matches that"
            description="Try part of a supplier's name or their short code. Retired suppliers are hidden unless you include archived ones."
          />
        );
      }
      // "No active suppliers" is a FILTER state — there are retired ones hidden —
      // not first-run, so it keeps the plain glyph. Only a genuinely empty book
      // (archived included and still none) earns the mascot welcome.
      if (!includeArchived) {
        return (
          <EmptyState
            icon={<Truck className="size-6" aria-hidden />}
            title="No active suppliers"
            description="Every supplier you buy from is retired, or you have not added one yet. Add a supplier to start ordering stock, or include archived ones to see retired records."
            actions={addSupplier}
          />
        );
      }
      return (
        <EmptyState
          icon={<Truck className="size-6" aria-hidden />}
          title="No suppliers yet"
          description="A supplier is a business you buy stock from. Add your first one and you can raise purchase orders against it."
          actions={addSupplier}
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Supplier</th>
            <th className="hidden @xl:table-cell">Contact</th>
            <th className="hidden @3xl:table-cell">Terms</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((supplier) => {
            const state = supplierState(supplier);
            const terms = supplierTerms(supplier);
            // Whoever you'd actually ring or email — a person's name if you have
            // it, otherwise the address you have on file.
            const contactName = supplier.contactName;
            const contactVia = supplier.email ?? supplier.phone;
            const contactSummary = contactName ?? contactVia;
            return (
              <tr
                key={supplier.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  openSupplier(supplier.id, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  openSupplier(supplier.id, event);
                }}
              >
                {/* `max-w-0 w-full` makes this the cell that GIVES, so a long
                    supplier name never pushes the State badge off the right. */}
                <td className="w-full max-w-0">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{supplier.name}</span>
                    <span className="truncate font-mono text-sm">{supplier.code}</span>
                    {/* Below @xl the Contact column is gone; below @3xl the Terms
                        column is gone. Each folds back here so a narrow pane
                        still says who to reach and how you buy. */}
                    {contactSummary ? (
                      <span className="truncate text-sm @xl:hidden">{contactSummary}</span>
                    ) : null}
                    {terms ? <span className="truncate text-sm @3xl:hidden">{terms}</span> : null}
                  </span>
                </td>
                <td className="hidden max-w-56 @xl:table-cell">
                  <span className="flex min-w-0 flex-col">
                    {contactName ? <span className="truncate">{contactName}</span> : null}
                    {contactVia ? (
                      <span className="truncate text-sm">{contactVia}</span>
                    ) : contactName ? null : (
                      <span>—</span>
                    )}
                  </span>
                </td>
                <td className="hidden max-w-56 truncate @3xl:table-cell">{terms ?? '—'}</td>
                <td>
                  <Badge color={state.tone} variant="soft" size="sm">
                    {state.label}
                  </Badge>
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
        label="Supplier list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search suppliers"
              placeholder="Supplier name or code…"
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
            <ToggleGroup
              size="sm"
              color="module"
              className="ml-auto shrink-0"
              value={includeArchived ? ['archived'] : []}
              onValueChange={(next: unknown[]) => {
                setIncludeArchived(next.includes('archived'));
                resetWindow();
              }}
            >
              <ToggleGroupItem
                value="archived"
                aria-label="Include archived suppliers"
                title="Include archived suppliers"
              >
                <Archive className="size-4" aria-hidden />
                <span className="hidden @2xl:inline">Archived</span>
              </ToggleGroupItem>
            </ToggleGroup>
            <Button
              size="sm"
              color="module"
              className="shrink-0 whitespace-nowrap"
              onClick={() => {
                ctx.open('inventory.suppliers.detail', { id: 'new' }, { target: 'tab' });
              }}
            >
              <Plus className="size-4" aria-hidden />
              <span className="hidden @lg:inline">New supplier</span>
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

      {/* Full width — base-100 card lifted off the recessed pane. Matches the
          house list convention: the table fills the pane. */}
      <Card className="min-h-0 flex-1 overflow-y-auto">{body()}</Card>

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
      </div>
    </div>
  );
}
