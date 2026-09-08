'use client';

// Bulk import — paste a list of old→new addresses, check them, bring them in.
//
// A PANE, not a modal: pasting a migration's worth of redirects and reading the
// preview is real work with real loss if it evaporates, which fails a modal's
// "nothing to lose / seconds not minutes" tests outright — and it commits to the
// server, so it cannot borrow the line-editor's "modal holding a pane's own
// draft" exemption either. As a pane it registers a dirty guard, so closing it
// mid-paste asks first, and it can sit BESIDE the list (how it is opened) so the
// existing rules stay in view while you add to them.
//
// Every pasted line is parsed and validated in the browser before anything is
// sent (see `parseRedirectRows`), so the preview shows exactly what will and will
// not import. The server still has the final say — it catches loops and
// duplicates across rules it already holds — and those come back as a per-row
// result you can fix and re-import without losing the rest.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Heading,
  Table,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { ArrowRight, CheckCircle2, Upload } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  parseRedirectRows,
  redirectErrorMessage,
  redirectTypeMeta,
  useBulkCreateRedirects,
  type BulkImportResult,
} from './redirects-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const SAMPLE = `/old-pricing, /pricing
/blog/2023-update, /news/product-update
/shop/old-item, /shop, temporary`;

export function RedirectsImportSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const bulk = useBulkCreateRedirects();

  const [text, setText] = useState('');
  // The rows actually sent on the last import, so a per-row server result can be
  // pointed back at the line it came from.
  const [result, setResult] = useState<{
    outcome: BulkImportResult;
    sent: { line: number; from: string; to: string }[];
  } | null>(null);

  const parsed = useMemo(() => parseRedirectRows(text), [text]);
  const valid = useMemo(() => parsed.filter((row) => row.error === null), [parsed]);
  const invalidCount = parsed.length - valid.length;

  // Dirty while there is pasted work not yet imported. Once imported, `result`
  // is set and the text is untouched, so the pane reads clean — and typing again
  // clears the result, making it dirty once more.
  useDirtySource(
    text.trim() !== '' && result === null,
    'You have redirects pasted in that you have not imported yet. Close anyway?'
  );

  const changeText = (next: string) => {
    setText(next);
    if (result !== null) setResult(null);
  };

  const runImport = () => {
    if (valid.length === 0 || bulk.isPending) return;
    const sent = valid.map((row) => ({ line: row.line, from: row.from, to: row.to }));
    bulk.mutate(
      valid.map((row) => ({
        from_path: row.from,
        to_path: row.to,
        status_code: row.statusCode,
      })),
      {
        onSuccess: (outcome) => {
          setResult({ outcome, sent });
          setText('');
          toast.add({
            title:
              outcome.inserted === 1
                ? '1 redirect imported'
                : `${outcome.inserted} redirects imported`,
            ...(outcome.skipped.length > 0
              ? { description: `${outcome.skipped.length} could not be added — see the summary.` }
              : {}),
            type: outcome.skipped.length > 0 ? 'warning' : 'success',
          });
        },
        onError: (err) => {
          toast.add({
            title: 'Could not import those redirects',
            description: redirectErrorMessage(err, 'Nothing was changed — try again in a moment.'),
            type: 'error',
          });
        },
      }
    );
  };

  const viewList = () => {
    ctx.open('cms.redirects.list', {}, { target: 'replace' });
    afterPaneChange(() => {
      toast.add({ title: 'Showing your redirects', type: 'success' });
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Bulk import actions"
        status={
          <Text className="truncate px-1 text-sm">
            {valid.length > 0
              ? `${valid.length} ready${invalidCount > 0 ? ` · ${invalidCount} to fix` : ''}`
              : 'Paste your list below'}
          </Text>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            loading={bulk.isPending}
            disabled={valid.length === 0}
            onClick={runImport}
          >
            <Upload className="size-4" aria-hidden />
            {valid.length > 1 ? `Import ${valid.length}` : 'Import'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Import redirects
            </Heading>
            <Text>
              Bringing over a lot of moved pages at once — after a site rebuild, say. Paste them all
              in below and add them in one go, instead of one at a time.
            </Text>
          </div>

          {result ? (
            <ImportResult
              outcome={result.outcome}
              sent={result.sent}
              onViewList={viewList}
              onImportMore={() => {
                setResult(null);
              }}
            />
          ) : null}

          <FormSection
            title="Your list"
            description="One redirect per line: the old address, then where it should go. Separate the two with a comma. Add a third word — permanent or temporary — to say whether the move is for good; leave it off and it counts as permanent."
          >
            <Textarea
              color="module"
              rows={8}
              value={text}
              spellCheck={false}
              className="font-mono text-sm"
              placeholder={SAMPLE}
              aria-label="Paste your redirects"
              onChange={(event) => {
                changeText(event.target.value);
              }}
            />
            <Text className="text-sm">
              Copied straight from a spreadsheet works too — the columns come across as tabs. Both
              addresses are paths on this site, starting with a slash.
            </Text>
          </FormSection>

          {parsed.length > 0 ? (
            <PreviewTable rows={parsed} validCount={valid.length} invalidCount={invalidCount} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── The parsed preview ─────────────────────────────────────────────────── */

function PreviewTable({
  rows,
  validCount,
  invalidCount,
}: {
  rows: ReturnType<typeof parseRedirectRows>;
  validCount: number;
  invalidCount: number;
}) {
  return (
    <FormSection
      title="Check before importing"
      description={
        invalidCount > 0
          ? `${validCount} ready to import. ${invalidCount} need a fix first — the rest will still import without them.`
          : `All ${validCount} ready to import.`
      }
    >
      <div className="border-base-300 max-h-96 overflow-y-auto rounded-lg border">
        <Table size="sm">
          <thead>
            <tr>
              <th className="w-10 text-right">#</th>
              <th>Redirect</th>
              <th>Type</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const type = redirectTypeMeta(row.statusCode);
              return (
                <tr key={row.line}>
                  <td className="text-right text-sm tabular-nums">{row.line}</td>
                  <td>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="max-w-80 truncate font-mono text-sm">{row.from || '—'}</span>
                      <span className="flex max-w-80 items-center gap-1 font-mono text-sm">
                        <ArrowRight className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{row.to || '—'}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <Badge color={type.tone} variant="soft" size="sm">
                      {type.label}
                    </Badge>
                  </td>
                  <td>
                    {row.error ? (
                      <span className="text-error text-sm">{row.error}</span>
                    ) : (
                      <Badge color="success" variant="soft" size="sm">
                        Ready
                      </Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
    </FormSection>
  );
}

/* ── The result of an import ────────────────────────────────────────────── */

function ImportResult({
  outcome,
  sent,
  onViewList,
  onImportMore,
}: {
  outcome: BulkImportResult;
  sent: { line: number; from: string; to: string }[];
  onViewList: () => void;
  onImportMore: () => void;
}) {
  const hasSkipped = outcome.skipped.length > 0;
  return (
    <Alert color={hasSkipped ? 'warning' : 'success'} variant="soft">
      <AlertContent>
        <AlertTitle>
          {outcome.inserted === 1
            ? '1 redirect imported'
            : `${outcome.inserted} redirects imported`}
        </AlertTitle>
        <AlertDescription>
          <div className="flex flex-col gap-3">
            {hasSkipped ? (
              <>
                <span>
                  {outcome.skipped.length === 1
                    ? 'One line could not be added — the server turned it down for this reason:'
                    : `${outcome.skipped.length} lines could not be added — the server turned them down for these reasons:`}
                </span>
                <ul className="flex flex-col gap-1">
                  {outcome.skipped.map((item) => {
                    const source = sent[item.row];
                    return (
                      <li key={item.row} className="text-sm">
                        <span className="font-mono">{source?.from ?? `Row ${item.row + 1}`}</span> —{' '}
                        {item.reason}
                      </li>
                    );
                  })}
                </ul>
                <span>Fix those lines and import them again — the rest are already in.</span>
              </>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                Every redirect on your list is now live.
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" color="module" onClick={onViewList}>
                View all redirects
              </Button>
              <Button size="sm" variant="outline" color="neutral" onClick={onImportMore}>
                Import another list
              </Button>
            </div>
          </div>
        </AlertDescription>
      </AlertContent>
    </Alert>
  );
}
