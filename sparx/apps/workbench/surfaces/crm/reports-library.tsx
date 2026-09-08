'use client';

// Saved reports (docs/144 §8) — the library, and the front door to the builder.
//
// The reports sparx ships lead, and they are labelled as such. That is not
// deference, it is teaching: somebody who has never built a report opens one of
// these, sees a working definition in the builder's own vocabulary, copies it and
// changes one thing. An empty list with a "New report" button teaches nobody.

import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Input, Text } from '@wizeworks/silicaui-react';
import { BarChart3, Copy, Trash2 } from 'lucide-react';

import type { SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useConfirm } from '../../lib/confirm';
import {
  VISUALIZATION_LABEL,
  describeDateRange,
  useArchiveReport,
  useDuplicateReport,
  useReportFields,
  useReports,
  type ReportableObject,
  type SavedReport,
} from './report-builder-data';

/**
 * The one-line summary of what a report asks, assembled from its own parts —
 * so the list says what each one ANSWERS rather than just what it is called.
 *
 * `fieldLabel` is passed in rather than looked up here because the breakdown is
 * stored as a COLUMN PATH. Printing it raw put "broken down by lifecycleStage"
 * and "broken down by assignedToUserId" in front of people who have never seen a
 * column name, in the one place whose job is to make the builder legible.
 */
function describe(report: SavedReport, fieldLabel: (objectKey: string, path: string) => string) {
  const count = report.measures.length;
  const what =
    count === 1 && report.measures[0]?.fn === 'count'
      ? 'How many'
      : `${String(count)} thing${count === 1 ? '' : 's'} worked out`;
  const by = report.groupBy
    ? `, broken down by ${fieldLabel(report.objectKey, report.groupBy.field).toLowerCase()}`
    : '';
  // Two reports that differ only in what they leave out read as the same report
  // without this — which is exactly the pair somebody is trying to tell apart.
  const rules = report.filters.conditions.length;
  const narrowed = rules > 0 ? `, narrowed by ${String(rules)} rule${rules === 1 ? '' : 's'}` : '';
  return `${what}${by}${narrowed} · ${describeDateRange(report.dateRange)}`;
}

/** Column path → the words the builder shows for it, falling back to the path
 *  itself only when the catalog has not loaded yet. */
function makeFieldLabel(objects: ReportableObject[]) {
  return (objectKey: string, path: string): string => {
    const object = objects.find((o) => o.objectKey === objectKey);
    return object?.fields.find((f) => f.path === path)?.label ?? path;
  };
}

export function ReportsLibrarySurface({ ctx }: { ctx: SurfaceContext }) {
  const { data, isPending, isFetching, refetch } = useReports();
  const { data: catalog } = useReportFields();
  const fieldLabel = makeFieldLabel(catalog?.objects ?? []);
  const duplicate = useDuplicateReport();
  const archive = useArchiveReport();
  const confirm = useConfirm();
  const [q, setQ] = useState('');

  const all = data?.items ?? [];
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? all.filter(
        (r) =>
          r.name.toLowerCase().includes(needle) ||
          (r.description ?? '').toLowerCase().includes(needle)
      )
    : all;
  const builtins = rows.filter((r) => r.builtinSlug);
  const mine = rows.filter((r) => !r.builtinSlug);

  function open(report: SavedReport, shiftKey: boolean): void {
    ctx.open('crm.report.builder', { id: report.id }, { target: shiftKey ? 'beside' : 'tab' });
  }

  async function remove(report: SavedReport): Promise<void> {
    const ok = await confirm({
      title: `Delete “${report.name}”?`,
      description: 'It will be removed from any dashboards it appears on. This cannot be undone.',
      confirmLabel: 'Delete report',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (ok) await archive.mutateAsync(report.id);
  }

  function Row({ report }: { report: SavedReport }) {
    return (
      <Card
        className="flex cursor-pointer items-start justify-between gap-4 p-4"
        onClick={(event) => open(report, event.shiftKey)}
      >
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{report.name}</strong>
            {report.builtinSlug ? (
              <Badge color="info" variant="soft">
                Ships with sparx
              </Badge>
            ) : null}
            <Badge color="neutral" variant="soft">
              {VISUALIZATION_LABEL[report.visualization]}
            </Badge>
          </div>
          {report.description ? <Text>{report.description}</Text> : null}
          <Text>{describe(report, fieldLabel)}</Text>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label={`Make a copy of ${report.name}`}
            onClick={(event) => {
              event.stopPropagation();
              void duplicate
                .mutateAsync({ id: report.id })
                .then((copy) => ctx.open('crm.report.builder', { id: copy.id }, { target: 'tab' }));
            }}
          >
            <Copy className="size-4" aria-hidden />
          </Button>
          {report.builtinSlug ? null : (
            <Button
              color="danger"
              variant="ghost"
              size="sm"
              aria-label={`Delete ${report.name}`}
              onClick={(event) => {
                event.stopPropagation();
                void remove(report);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Report library controls"
        controls={
          <>
            <div className="max-w-xs min-w-0 flex-1">
              <Input
                color="module"
                size="sm"
                aria-label="Search reports"
                value={q}
                placeholder="Search reports…"
                onChange={(event) => setQ(event.target.value)}
              />
            </div>
          </>
        }
        refresh={
          <div className="ml-auto flex items-center gap-2">
            <Button
              color="module"
              size="sm"
              onClick={(event) =>
                ctx.open(
                  'crm.report.builder',
                  { id: 'new' },
                  { target: event.shiftKey ? 'beside' : 'tab' }
                )
              }
            >
              New report
            </Button>
            <RefreshButton isFetching={isFetching} onRefresh={() => void refetch()} />
          </div>
        }
      />

      <div className="flex flex-col gap-6 overflow-auto p-6">
        {isPending ? (
          <div className="skeleton h-40 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BarChart3 className="size-6" aria-hidden />}
            title={needle ? 'Nothing matches that' : 'No reports yet'}
            description={
              needle
                ? 'Try a different word.'
                : 'Build one to answer a question about your business — or open one of ours and copy it.'
            }
          />
        ) : (
          <>
            {mine.length > 0 ? (
              <section className="flex flex-col gap-2">
                <Text>Yours</Text>
                {mine.map((report) => (
                  <Row key={report.id} report={report} />
                ))}
              </section>
            ) : null}
            {builtins.length > 0 ? (
              <section className="flex flex-col gap-2">
                <Text>
                  Ready-made — open one to see how it is built, then copy it and change a thing
                </Text>
                {builtins.map((report) => (
                  <Row key={report.id} report={report} />
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
