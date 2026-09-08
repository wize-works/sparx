'use client';

// The kinds of product this business can describe — and the doorway to defining
// new ones (docs/143).
//
// A product type declares the extra descriptive attributes a product carries
// beyond its price, code and photos — fabric and care for apparel, ingredients
// and allergens for food, specs for electronics. This is the commerce mirror of
// Content types, and it is a SMALL, bounded set: the platform built-ins plus the
// handful a business defines for itself, so everything loads at once and the
// search + filter run in the browser.
//
// Two consecutive tables under plain headings carry the one meaningful split —
// "the ones you made" vs "the shared built-in ones". A built-in stays view-first
// until you edit it, at which point it becomes your own copy; that state is a
// real badge, not an eyebrow.

import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Filter,
  FilterItem,
  Heading,
  SearchInput,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { Plus, Shapes } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { ListEmptyState } from '../../components/list-empty-state';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { useProductTypeList, type ProductType } from './product-types-data';
import { RowOpenHint } from '../../components/row-open-hint';

const KIND_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Yours' },
  { value: 'built_in', label: 'Built-in' },
] as const;

type KindFilterValue = (typeof KIND_FILTERS)[number]['value'];

/** Same modifier contract as every other list in the app. */
function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

function attributeLabel(type: ProductType): string {
  const n = type.attributeSchema.fields.length;
  if (n === 0) return 'No attributes';
  return `${String(n)} ${n === 1 ? 'attribute' : 'attributes'}`;
}

export function ProductTypesListSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilterValue>('all');

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useProductTypeList();

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const rows = data ?? [];
    return rows.filter((type) => {
      if (kind === 'custom' && type.isBuiltIn) return false;
      if (kind === 'built_in' && !type.isBuiltIn) return false;
      if (needle) {
        const haystack =
          `${type.name} ${type.pluralName ?? ''} ${type.key} ${type.description ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [data, kind, needle]);

  const custom = filtered.filter((type) => !type.isBuiltIn);
  const builtIn = filtered.filter((type) => type.isBuiltIn);
  const narrowed = kind !== 'all' || needle !== '';

  const open = (type: ProductType, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.product-types.detail', { key: type.key }, { target: targetFor(event) });
  };

  const create = (event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('commerce.product-types.detail', { key: 'new' }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Product type list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search product types"
              placeholder="Name or id…"
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
            title="Define a new kind of product — hold Shift to open alongside, Alt for a new window"
            onClick={create}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @2xl:inline">New type</span>
          </Button>
        }
        controls={
          <>
            <Filter
              color="module"
              value={kind}
              onValueChange={(next) => {
                setKind((next as KindFilterValue | null) ?? 'all');
              }}
              showReset={false}
              aria-label="Filter by kind"
            >
              {KIND_FILTERS.map((entry) => (
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          // A failed load REPLACES the list — a false "nothing here" over a
          // connection failure is the worst thing to say about a schema.
          <Card className="flex-1">
            <EmptyState
              icon={<Shapes className="size-6" aria-hidden />}
              title="Could not load your product types"
              description="This is a problem reaching the server. Nothing you have defined is affected."
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
          </Card>
        ) : isLoading ? (
          <Card className="flex-1">
            <p className="p-4 text-sm" role="status">
              Loading…
            </p>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="flex-1">
            <ListEmptyState
              filtered={narrowed}
              noResults={{
                icon: <Shapes className="size-6" aria-hidden />,
                title: 'Nothing matches that',
                description: 'Try a different search, or switch the filter back to All.',
              }}
              firstRun={{
                title: 'No product types yet',
                description:
                  'Define the extra details a kind of product carries — fabric and care for clothing, ingredients for food, specs for electronics — so every product of that kind is described the same way.',
                actions: (
                  <Button
                    size="sm"
                    color="module"
                    onClick={() => {
                      create({ shiftKey: false, altKey: false });
                    }}
                  >
                    <Plus className="size-4" aria-hidden />
                    New type
                  </Button>
                ),
              }}
            />
          </Card>
        ) : (
          <div className="flex w-full flex-col gap-6">
            <TypeGroup
              title="Your types"
              description="The kinds of product you defined. Open one to change its attributes."
              types={custom}
              emptyHint={
                kind === 'built_in'
                  ? null
                  : 'You have not defined any of your own yet. Use “New type” above, or open a built-in and edit it to start your own copy.'
              }
              onOpen={open}
            />
            <TypeGroup
              title="Built-in types"
              description="Shared types that come with sparx. Open one to use it as-is, or edit it to keep your own copy with the attributes you want."
              types={builtIn}
              emptyHint={null}
              onOpen={open}
            />
          </div>
        )}
      </div>

      <RowOpenHint />
    </div>
  );
}

/* ── One group of types ─────────────────────────────────────────────────── */

interface TypeGroupProps {
  title: string;
  description: string;
  types: ProductType[];
  /** Shown instead of the rows when the group is empty; null hides the group. */
  emptyHint: string | null;
  onOpen: (type: ProductType, event: { shiftKey: boolean; altKey: boolean }) => void;
}

function TypeGroup({ title, description, types, emptyHint, onOpen }: TypeGroupProps) {
  if (types.length === 0 && emptyHint === null) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <Heading level={2} className="text-lg font-semibold">
          {title}
        </Heading>
        <Text className="text-sm">{description}</Text>
      </div>

      {types.length === 0 ? (
        <Text className="px-1 text-sm">{emptyHint}</Text>
      ) : (
        <Table size="sm" hover>
          <thead>
            <tr>
              <th>Name</th>
              <th className="hidden @xl:table-cell">Key</th>
              <th className="hidden @2xl:table-cell">Attributes</th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => (
              <tr
                key={type.id}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                onClick={(event) => {
                  onOpen(type, event);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onOpen(type, event);
                }}
              >
                <td>
                  <span className="flex flex-wrap items-center gap-2">
                    {type.icon ? <span aria-hidden>{type.icon}</span> : null}
                    <span className="font-medium">{type.name}</span>
                    {type.isBuiltIn ? (
                      <Badge color="info" variant="soft" size="sm">
                        Built-in
                      </Badge>
                    ) : (
                      <Badge color="success" variant="soft" size="sm">
                        Yours
                      </Badge>
                    )}
                  </span>
                  {type.description ? (
                    <span className="mt-0.5 block max-w-96 truncate text-sm">
                      {type.description}
                    </span>
                  ) : null}
                </td>
                <td className="hidden font-mono text-sm @xl:table-cell">{type.key}</td>
                <td className="hidden text-sm whitespace-nowrap @2xl:table-cell">
                  {attributeLabel(type)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
