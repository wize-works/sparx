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
// The preview knows two things about the business — her connected web addresses
// and the rules she already has — so a pasted search-console URL is read as a
// path, and a line that already has a rule says so instead of promising "Ready"
// and being turned down (issue 400).

import { useMemo, useState } from 'react';
import { Button, Text, Textarea, useToast } from '@wizeworks/silicaui-react';
import { faUpload } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { countRows, PreviewTable } from './redirects-import-preview';
import { ImportResult, type SentRow } from './redirects-import-result';
import {
  parseRedirectRows,
  redirectErrorMessage,
  useBulkCreateRedirects,
  useRedirectImportContext,
  type BulkImportResult,
} from './redirects-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

const SAMPLE = `/old-pricing, /pricing
/blog/2023-update, /news/product-update
/shop/old-item, /shop, temporary`;

export function RedirectsImportSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const bulk = useBulkCreateRedirects();
  const context = useRedirectImportContext();

  const [text, setText] = useState('');
  // The rows actually sent on the last import, so a per-row server result can be
  // pointed back at the line it came from.
  const [result, setResult] = useState<{ outcome: BulkImportResult; sent: SentRow[] } | null>(null);

  const parsed = useMemo(() => parseRedirectRows(text, context), [text, context]);
  const ready = useMemo(() => parsed.filter((row) => row.state === 'ready'), [parsed]);
  const counts = useMemo(() => countRows(parsed), [parsed]);

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

  const announce = (outcome: BulkImportResult) => {
    const left = outcome.skipped.length;
    toast.add({
      title:
        outcome.inserted === 1 ? '1 redirect imported' : `${outcome.inserted} redirects imported`,
      ...(left > 0
        ? {
            description:
              left === 1
                ? 'One line was left out — see the summary.'
                : `${left} lines were left out — see the summary.`,
          }
        : {}),
      type: left > 0 ? 'warning' : 'success',
    });
  };

  const runImport = () => {
    if (ready.length === 0 || bulk.isPending) return;
    const sent: SentRow[] = ready.map((row) => ({ line: row.line, from: row.from, to: row.to }));
    bulk.mutate(
      ready.map((row) => ({
        from_path: row.from,
        to_path: row.to,
        status_code: row.statusCode,
      })),
      {
        onSuccess: (outcome) => {
          setResult({ outcome, sent });
          setText('');
          announce(outcome);
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
        status={<Text className="truncate px-1 text-sm">{toolbarStatus(counts)}</Text>}
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            loading={bulk.isPending}
            disabled={ready.length === 0}
            onClick={runImport}
          >
            <Icon glyph={faUpload} className="size-4" aria-hidden />
            {ready.length > 1 ? `Import ${ready.length}` : 'Import'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <Text>
            Bringing over a lot of moved pages at once — after a site rebuild, say. Paste them all
            in below and add them in one go, instead of one at a time.
          </Text>

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
              Copied straight from a spreadsheet works too — the columns come across as tabs. Full
              web addresses work as well, as long as they are on one of your own; only the part
              after the address is kept.
            </Text>
          </FormSection>

          {parsed.length > 0 ? <PreviewTable rows={parsed} counts={counts} /> : null}
        </div>
      </div>
    </div>
  );
}

/** The one line of status the toolbar has room for. */
function toolbarStatus(counts: { ready: number; fix: number; already: number }): string {
  if (counts.ready === 0 && counts.fix === 0 && counts.already === 0)
    return 'Paste your list below';
  const parts = [`${String(counts.ready)} ready`];
  if (counts.already > 0) parts.push(`${String(counts.already)} already set up`);
  if (counts.fix > 0) parts.push(`${String(counts.fix)} to fix`);
  return parts.join(' · ');
}
