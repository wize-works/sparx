'use client';

// The rules themselves.
//
// A ROW OPENS THE RULE. This once said "rows are not clickable: a redirect has
// no editable surface — it is created, imported or deleted, never changed in
// place", and that was a dead end wearing a design decision: adding a duplicate
// is refused with "a redirect from /shipping already exists", and the only way
// to act on that sentence was to delete the rule — through a confirm warning
// that its search-engine standing is lost — and type it again (issue 396).

import { Badge, Button } from '@wizeworks/silicaui-react';
import { Table } from '../../components/table';
import { faArrowRight, faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { formatDate, redirectTypeMeta, type Redirect } from './redirects-data';

interface RedirectsTableProps {
  rows: readonly Redirect[];
  onOpen: (row: Redirect) => void;
  onDelete: (row: Redirect) => void;
  /** Which row is mid-delete, so only its own button spins. */
  removingId: string | null;
  busy: boolean;
}

export function RedirectsTable({ rows, onOpen, onDelete, removingId, busy }: RedirectsTableProps) {
  return (
    <Table size="sm">
      <thead>
        <tr>
          <th>Redirect</th>
          <th>Type</th>
          <th className="hidden text-right @xl:table-cell">Times used</th>
          <th className="hidden @2xl:table-cell">Added</th>
          <th className="text-right">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const type = redirectTypeMeta(row.status_code);
          return (
            <tr
              key={row.id}
              // A row is the rule. `tabIndex`/`onKeyDown` rather than wrapping
              // the cells in a button: the row already holds a Remove button,
              // and a button inside a button is invalid and swallows the click.
              className="hover:bg-base-200 cursor-pointer"
              tabIndex={0}
              aria-label={`Change the redirect from ${row.from_path}`}
              onClick={() => {
                onOpen(row);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                if (event.target !== event.currentTarget) return;
                event.preventDefault();
                onOpen(row);
              }}
            >
              <td>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="max-w-96 truncate font-mono text-sm font-medium">
                    {row.from_path}
                  </span>
                  <span className="flex max-w-96 items-center gap-1 font-mono text-sm">
                    <Icon glyph={faArrowRight} className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{row.to_path}</span>
                  </span>
                  {row.property_id === null ? (
                    <span className="text-sm">Shared across all your sites</span>
                  ) : null}
                </div>
              </td>
              <td>
                <Badge color={type.tone} variant="soft" size="sm" title={type.detail}>
                  {type.label}
                </Badge>
              </td>
              <td className="hidden text-right tabular-nums @xl:table-cell">
                {row.hit_count.toLocaleString()}
              </td>
              <td className="hidden text-sm whitespace-nowrap @2xl:table-cell">
                {formatDate(row.created_at)}
              </td>
              <td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  color="danger"
                  shape="square"
                  aria-label={`Remove the redirect from ${row.from_path}`}
                  title="Remove this redirect"
                  loading={removingId === row.id && busy}
                  disabled={busy}
                  onClick={(event) => {
                    // The row opens the rule; this must not do both.
                    event.stopPropagation();
                    onDelete(row);
                  }}
                >
                  <Icon glyph={faTrashCan} className="size-4" aria-hidden />
                </Button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
