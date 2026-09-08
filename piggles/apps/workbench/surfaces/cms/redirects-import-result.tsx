'use client';

// What happened after an import, and where to go next.
//
// Split from `redirects-import.tsx` under RULE #0.5.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
} from '@wizeworks/silicaui-react';
import { faCircleCheck } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import type { BulkImportResult } from './redirects-data';

/** The line each server refusal came from, so a reason can name the address. */
export interface SentRow {
  line: number;
  from: string;
  to: string;
}

function heading(inserted: number): string {
  if (inserted === 0) return 'Nothing new to add';
  return inserted === 1 ? '1 redirect imported' : `${String(inserted)} redirects imported`;
}

export function ImportResult({
  outcome,
  sent,
  onViewList,
  onImportMore,
}: {
  outcome: BulkImportResult;
  sent: SentRow[];
  onViewList: () => void;
  onImportMore: () => void;
}) {
  const hasSkipped = outcome.skipped.length > 0;
  return (
    <Alert color={hasSkipped ? 'warning' : 'success'} variant="soft">
      <AlertContent>
        <AlertTitle>{heading(outcome.inserted)}</AlertTitle>
        <AlertDescription>
          <div className="flex flex-col gap-3">
            {hasSkipped ? <SkippedList outcome={outcome} sent={sent} /> : <AllLanded />}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" color="module" onClick={onViewList}>
                View all redirects
              </Button>
              <Button size="sm" variant="outline" onClick={onImportMore}>
                Import another list
              </Button>
            </div>
          </div>
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
}

function AllLanded() {
  return (
    <span className="flex items-center gap-2">
      <Icon glyph={faCircleCheck} className="size-4 shrink-0" aria-hidden />
      Every redirect on your list is now live.
    </span>
  );
}

/** The rest of the list is IN. Saying so is the point: one refused line used to
 *  take every good line down with it (issue 399), so "the rest are already in"
 *  had to become true before it could be printed. */
function SkippedList({ outcome, sent }: { outcome: BulkImportResult; sent: SentRow[] }) {
  const one = outcome.skipped.length === 1;
  return (
    <>
      <span>
        {one
          ? 'One line was left out, for this reason:'
          : `${String(outcome.skipped.length)} lines were left out, for these reasons:`}
      </span>
      <ul className="flex flex-col gap-1">
        {outcome.skipped.map((item) => {
          const source = sent[item.row];
          return (
            <li key={item.row} className="text-sm">
              <span className="font-mono">{source?.from ?? `Row ${String(item.row + 1)}`}</span> —{' '}
              {item.reason}
            </li>
          );
        })}
      </ul>
      <span>Everything else on your list is in. Sort those out and import them on their own.</span>
    </>
  );
}
