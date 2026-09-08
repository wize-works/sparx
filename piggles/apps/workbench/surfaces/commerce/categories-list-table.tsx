'use client';

// The categories table: sortable headers, one row per aisle, each showing its
// full trail so the hierarchy survives any sort order.
//
// Split out of `categories-list.tsx` to match the groups list beside it
// (`collections-list` / `collections-list-table`), which is the house shape for a
// list pane: the pane owns the toolbar, the fetch and the sort state; the table
// owns the markup.
//
// Unlike the groups table, sorting here is CLIENT-side — the categories endpoint
// returns the whole tree in one response, so there is no paged window a local
// sort could misrepresent.

import { Badge, Tooltip } from '@wizeworks/silicaui-react';
import { faArrowDown, faArrowUp } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { Table } from '../../components/table';
import type { CategoryChoice } from './categories-data';

/** Natural tree order (parents before children) cannot be expressed as a single
 *  column, so it is `null` rather than a third key. */
export type CatSortKey = 'name' | 'productCount';
export type SortDir = 'asc' | 'desc';
export interface Sort {
  key: CatSortKey;
  dir: SortDir;
}

interface Modifiers {
  shiftKey: boolean;
  altKey: boolean;
}

function SortHeader({
  sortKey,
  label,
  extra,
  sort,
  onToggle,
}: {
  sortKey: CatSortKey;
  label: string;
  extra?: string;
  sort: Sort | null;
  onToggle: (key: CatSortKey) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      className={extra}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="link link-hover inline-flex items-center gap-1"
        onClick={() => {
          onToggle(sortKey);
        }}
      >
        {label}
        {active ? (
          <Icon
            glyph={sort.dir === 'asc' ? faArrowUp : faArrowDown}
            className="size-3"
            aria-hidden
          />
        ) : null}
      </button>
    </th>
  );
}

/** The number beside an aisle, and the honest footnote when it is not the whole
 *  story.
 *
 *  The figure is what a SHOPPER would find there, which is the question anybody
 *  reading this column is asking. It used to be a raw count of filing rows, so
 *  Goods read 6 over a shop page that said "0 products · Nothing here yet", and
 *  seven of Juniper Row's eight stocked aisles overstated the same way (issue
 *  382). A truthful 0 alone would read as "my products have vanished", so where
 *  anything is filed-but-unshown the row says so and the tooltip says why. */
function ProductCount({ category }: { category: CategoryChoice }) {
  const hidden = category.hiddenProductCount;
  if (hidden === 0) return <>{String(category.productCount)}</>;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {String(category.productCount)}
      <Tooltip
        content={`${String(hidden)} more ${hidden === 1 ? 'product is' : 'products are'} filed under this heading but not on your website — archived, still a draft, or kept for one of your other sites.`}
      >
        <Badge color="info" variant="soft" size="sm">
          {String(hidden)} not shown
        </Badge>
      </Tooltip>
    </span>
  );
}

function CategoryRow({
  category,
  onOpen,
}: {
  category: CategoryChoice;
  onOpen: (category: CategoryChoice, modifiers: Modifiers) => void;
}) {
  return (
    <tr
      className="cursor-pointer"
      tabIndex={0}
      role="button"
      onClick={(event) => {
        onOpen(category, event);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(category, event);
      }}
    >
      <td>
        <span className="min-w-0">
          {category.trail.slice(0, -1).map((ancestor, index) => (
            <span key={`${category.id}:${String(index)}`}>{ancestor} › </span>
          ))}
          <span className="font-semibold">{category.name}</span>
          {/* The Featured column is dropped on a narrow pane, so the badge moves
              INTO the name cell rather than disappearing — otherwise a phone
              cannot tell which aisles are featured at all, and a phone is where
              this console gets opened. Same badge, one place at a time. */}
          {category.featured ? (
            <Badge color="warning" variant="soft" size="sm" className="ml-2 @lg:hidden">
              Featured
            </Badge>
          ) : null}
        </span>
      </td>
      <td className="hidden @lg:table-cell">
        {category.featured ? (
          <Badge color="warning" variant="soft" size="sm">
            Featured
          </Badge>
        ) : null}
      </td>
      <td className="text-right tabular-nums">
        <ProductCount category={category} />
      </td>
    </tr>
  );
}

export function CategoriesTable({
  rows,
  sort,
  onToggleSort,
  onOpen,
}: {
  rows: CategoryChoice[];
  sort: Sort | null;
  onToggleSort: (key: CatSortKey) => void;
  onOpen: (category: CategoryChoice, modifiers: Modifiers) => void;
}) {
  return (
    <Table size="sm" hover>
      <thead>
        <tr>
          <SortHeader sortKey="name" label="Category" sort={sort} onToggle={onToggleSort} />
          <th className="hidden @lg:table-cell">Featured</th>
          <SortHeader
            sortKey="productCount"
            label="Products"
            extra="text-right"
            sort={sort}
            onToggle={onToggleSort}
          />
        </tr>
      </thead>
      <tbody>
        {rows.map((category) => (
          <CategoryRow key={category.id} category={category} onOpen={onOpen} />
        ))}
      </tbody>
    </Table>
  );
}
