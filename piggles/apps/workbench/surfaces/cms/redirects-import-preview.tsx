'use client';

// The parsed preview: every pasted line, and what will happen to it.
//
// Split from `redirects-import.tsx` under RULE #0.5.
//
// NOT A TABLE, and that is the fix rather than the shortcut. It was one, in a
// `max-h-96` box inside a pane that already scrolls — so two scrollbars shared
// one list, the column headers slid out of sight behind the box's own top edge,
// and at 360px the whole point of the section went off the right-hand side: four
// columns need 617px, a phone gives the box 290, and Type and Status were the
// two that fell off. She could see four addresses and nothing about which of
// them was wrong.
//
// A check list is not a data grid. Each line stacks on a phone and lays out in a
// row from `sm:` up, so every part is on screen at every width with no sideways
// swipe and no second scrollbar.

import { Badge, Text } from '@wizeworks/silicaui-react';
import { faArrowRight } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { FormSection } from '../../components/form-section';
import { redirectTypeMeta, type ParsedRedirectRow } from './redirects-data';

/** How many of each kind are on the list. */
export interface PreviewCounts {
  ready: number;
  fix: number;
  already: number;
}

export function countRows(rows: ParsedRedirectRow[]): PreviewCounts {
  return {
    ready: rows.filter((row) => row.state === 'ready').length,
    fix: rows.filter((row) => row.state === 'fix').length,
    already: rows.filter((row) => row.state === 'already').length,
  };
}

/** One plain sentence about the whole list, so she knows what pressing Import does. */
function summarize(counts: PreviewCounts): string {
  const parts = [counts.ready === 1 ? '1 will be added' : `${String(counts.ready)} will be added`];
  if (counts.already > 0) {
    parts.push(
      counts.already === 1
        ? '1 is already set up and will be left alone'
        : `${String(counts.already)} are already set up and will be left alone`
    );
  }
  if (counts.fix > 0) {
    parts.push(counts.fix === 1 ? '1 needs a fix first' : `${String(counts.fix)} need a fix first`);
  }
  return `${parts.join(', ')}.`;
}

export function PreviewTable({
  rows,
  counts,
}: {
  rows: ParsedRedirectRow[];
  counts: PreviewCounts;
}) {
  return (
    <FormSection title="Check before importing" description={summarize(counts)}>
      <ul className="border-base-300 divide-base-300 divide-y rounded-lg border">
        {rows.map((row) => (
          <PreviewRow key={row.line} row={row} />
        ))}
      </ul>
    </FormSection>
  );
}

function PreviewRow({ row }: { row: ParsedRedirectRow }) {
  const type = redirectTypeMeta(row.statusCode);
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-4">
      <Text className="w-6 shrink-0 text-sm tabular-nums">{row.line}</Text>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-mono text-sm">{row.from || '—'}</span>
        <span className="flex min-w-0 items-center gap-1 font-mono text-sm">
          <Icon glyph={faArrowRight} className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{row.to || '—'}</span>
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1 sm:w-64">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={type.tone} variant="soft" size="sm">
            {type.label}
          </Badge>
          <StateBadge row={row} />
        </div>
        {row.message === null ? null : <Message row={row} />}
      </div>
    </li>
  );
}

/**
 * Three answers, three colors. "Already set up" is deliberately NOT red: nothing
 * is wrong with the line, it just will not be imported, and marking it as her
 * mistake sends her hunting for one.
 */
function StateBadge({ row }: { row: ParsedRedirectRow }) {
  if (row.state === 'ready') {
    return (
      <Badge color="success" variant="soft" size="sm">
        Ready
      </Badge>
    );
  }
  if (row.state === 'already') {
    return (
      <Badge color="info" variant="soft" size="sm">
        Already set up
      </Badge>
    );
  }
  return (
    <Badge color="error" variant="soft" size="sm">
      Needs a fix
    </Badge>
  );
}

function Message({ row }: { row: ParsedRedirectRow }) {
  if (row.state === 'fix') return <span className="text-error text-sm">{row.message}</span>;
  return <Text className="text-sm">{row.message}</Text>;
}
