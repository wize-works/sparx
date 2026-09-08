'use client';

// MOVE IN — the run itself.
//
// Four states in one pane, because they are one errand and splitting them across
// panes would lose the file between steps:
//
//   1. Drop the file — or, for the three platforms with an API a tenant can
//      authorise themselves, connect to it and let us fetch instead.
//   2. What we found, and what is wrong with it — checked HERE, in the browser,
//      with nothing uploaded. A file that cannot be read is rejected in the same
//      second it is dropped.
//   3. Import — the only point at which anything is written.
//   4. Watch it land, then read what happened row by row.
//
// The order of those steps is the whole design. Every importer that people abandon
// asks for the upload first and reports the problems afterwards, by which point the
// tenant has already been told their catalogue is half-broken and has no idea which
// half.
//
// Steps 2 to 4 are IDENTICAL whether the rows came from a file or from a live
// connection, and that is not a coincidence — the connector returns the same
// canonical rows the file parser does, validated by the same function in the same
// browser. A live pull cannot skip the check a file gets, because there is only one
// check and only one place it happens.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Heading,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileUp,
  Loader2,
  Play,
  Plug,
  RotateCcw,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import {
  summarize,
  type CanonicalEntity,
  type MappedEntity,
  type ValidationIssue,
} from '@wizeworks/migration';
import { ColumnMapper } from './column-mapper';
import { LiveConnection, type LivePull } from './live-connection';
import { ReportProblemButton } from '../../components/feedback/report-problem-button';
import { ModuleScope } from '../../components/module-scope';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  downloadText,
  entityLabel,
  loadFile,
  problemsCsv,
  runTone,
  sentenceList,
  useMigrationRun,
  useMigrationVendors,
  useStartMigration,
  vendorHue,
  type LoadedFile,
} from './data';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4 overflow-y-auto';

/** One validation issue, written for the person who has to fix it. */
function IssueRow({ issue }: { issue: ValidationIssue }) {
  const isError = issue.severity === 'error';
  return (
    <div className="border-base-300 flex items-start gap-3 border-b py-2 last:border-b-0">
      <Badge color={isError ? 'danger' : 'warning'} variant="soft" size="sm" className="mt-0.5">
        {isError ? 'Must fix' : 'Note'}
      </Badge>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text className="text-sm">
          {issue.rowIndex >= 0 ? `Row ${issue.rowIndex + 2}: ` : ''}
          {issue.message}
        </Text>
        {issue.hint !== undefined ? <Text className="text-sm">{issue.hint}</Text> : null}
      </div>
    </div>
  );
}

/**
 * One entity's findings, before anything is written.
 *
 * Shared by the file path and the live connection, which is what stops the two
 * drifting into two different accounts of the same data.
 */
function EntityReport({ mapped }: { mapped: MappedEntity }) {
  const { entity, rows, report } = mapped;

  return (
    <section className="border-base-300 bg-base-100 flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level={3} className="text-base">
          {entityLabel(entity)}
        </Heading>
        <Badge
          color={report.blocked ? 'danger' : report.errorCount > 0 ? 'warning' : 'success'}
          variant="soft"
          size="sm"
        >
          {report.blocked
            ? 'Cannot import yet'
            : `${report.okCount.toLocaleString()} of ${rows.length.toLocaleString()} ready`}
        </Badge>
      </div>

      <Text>{summarize(report)}</Text>

      {report.issues.length > 0 ? (
        <div className="border-base-300 mt-1 max-h-64 overflow-y-auto rounded-lg border px-3">
          {report.issues.slice(0, 100).map((issue, index) => (
            <IssueRow key={`${issue.code}-${issue.rowIndex}-${index}`} issue={issue} />
          ))}
        </div>
      ) : null}

      {report.truncated ? (
        <Text className="text-sm">
          Showing the first {report.issues.length} of {report.errorCount + report.warningCount}.
          Fixing the ones above usually fixes the rest.
        </Text>
      ) : null}

      {report.unmappedColumns.length > 0 ? (
        <Text className="text-sm">
          {report.unmappedColumns.length} column
          {report.unmappedColumns.length === 1 ? '' : 's'} in this file have no home here and will
          be left behind: {report.unmappedColumns.slice(0, 6).join(', ')}
          {report.unmappedColumns.length > 6 ? '…' : ''}
        </Text>
      ) : null}
    </section>
  );
}

/** What we found in the file, per entity, before anything is sent. */
function FileReport({
  loaded,
  onManual,
}: {
  loaded: LoadedFile;
  onManual: (mapped: MappedEntity | null) => void;
}) {
  const { result } = loaded;

  // Nothing recognised it — which is not a dead end. Every other importer stops
  // here; this one asks two questions and carries on.
  if (result.detected === null) {
    if (result.headers.length === 0) {
      return (
        <Alert color="danger" variant="soft">
          <AlertContent>
            <AlertTitle>There are no columns in this file</AlertTitle>
            <AlertDescription>
              It may be empty, or it may not be a spreadsheet at all. Export it again from your old
              platform and try once more.
            </AlertDescription>
          </AlertContent>
        </Alert>
      );
    }
    return <ColumnMapper headers={result.headers} raw={result.raw} onChange={onManual} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert color="success" variant="soft">
        <AlertContent>
          <AlertTitle>
            This is a {result.detected.vendorName} {result.detected.label.toLowerCase()} export
          </AlertTitle>
          <AlertDescription>
            We can tell because it {sentenceList(result.detected.reasons)}.
          </AlertDescription>
        </AlertContent>
      </Alert>

      {result.entities.map((mapped) => (
        <EntityReport key={mapped.entity} mapped={mapped} />
      ))}
    </div>
  );
}

/** Live progress once the run has started. */
function RunProgress({ runId }: { runId: string }) {
  const { data, isPending } = useMigrationRun(runId);

  if (isPending || data === undefined) return <Text>Starting…</Text>;

  const { run, problems } = data;
  const running = run.status === 'running';

  return (
    <div className="flex flex-col gap-4">
      <Alert color={runTone(run.status)} variant="soft">
        <AlertContent>
          <AlertTitle>
            {/* A practice run must not claim to be moving anything WHILE it runs.
                The finished state said "nothing was saved" correctly, but for the
                minute before that the screen read "Bringing your business over…"
                — which is the one sentence a nervous person is watching for, and
                it was not true. */}
            {running
              ? run.dryRun
                ? 'Trying it out — nothing is being saved…'
                : 'Bringing your business over…'
              : run.status === 'failed'
                ? 'Some of this did not land'
                : run.dryRun
                  ? 'Practice run finished — nothing was saved'
                  : 'Your business is here'}
          </AlertTitle>
          <AlertDescription>
            {running
              ? run.dryRun
                ? 'We are checking every row against what you already have. Nothing is being written to your business.'
                : 'You can close this and come back — it keeps going without you.'
              : run.status === 'failed'
                ? 'The rest did come across. Nothing below has to be done again — bringing the same file in a second time updates what is here rather than duplicating it.'
                : run.dryRun
                  ? 'This is exactly what a real import would do. Run it for real when you are ready.'
                  : 'Everything below is now in your account.'}
          </AlertDescription>
          {/* A part-landed migration is the worst thing to leave someone alone with:
              they can see a number that is wrong and have no way to know which half
              of their business is missing. The run id is what lets us answer that
              without asking them to describe it. */}
          {run.status === 'failed' ? (
            <ReportProblemButton
              className="mt-3 self-start"
              subject={`Part of my move from ${run.vendor ?? 'my old platform'} did not land`}
              details={[
                `Moving from: ${run.vendor ?? 'not recorded'}`,
                `Started: ${run.startedAt ?? 'unknown'}`,
                `Reference: ${runId}`,
                run.dryRun ? 'This was a practice run — nothing was being saved.' : '',
                '',
                'What happened per kind of record:',
                ...run.entities.map(
                  (entity) =>
                    `  ${entityLabel(entity.entity)}: ${(entity.imported + entity.updated).toLocaleString()} of ${entity.rowCount.toLocaleString()} came over, ${entity.errors.toLocaleString()} did not`
                ),
                ...(problems.length === 0
                  ? []
                  : [
                      '',
                      'First few problems:',
                      ...problems
                        .slice(0, 5)
                        .map(
                          (problem) =>
                            `  ${problem.naturalKey ?? `row ${problem.rowIndex + 2}`} — ${problem.message ?? 'no reason given'}`
                        ),
                    ]),
              ]
                .filter((line) => line !== '')
                .join('\n')}
            />
          ) : null}
        </AlertContent>
      </Alert>

      <div className="grid gap-3 @2xl:grid-cols-2">
        {run.entities.map((entity) => (
          <div
            key={entity.entity}
            className="border-base-300 bg-base-100 flex flex-col gap-1 rounded-xl border p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <Heading level={3} className="text-base">
                {entityLabel(entity.entity)}
              </Heading>
              {entity.done ? (
                <CircleCheck className="text-success size-4" aria-hidden />
              ) : (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              )}
            </div>
            <Text className="text-2xl font-semibold tabular-nums">
              {(entity.imported + entity.updated).toLocaleString()}
            </Text>
            <Text className="text-sm">
              of {entity.rowCount.toLocaleString()}{' '}
              {run.dryRun ? 'would come over' : 'brought over'}
              {entity.errors > 0 ? ` · ${entity.errors.toLocaleString()} need a look` : ''}
            </Text>
          </div>
        ))}
      </div>

      {problems.length > 0 ? (
        <section className="border-base-300 bg-base-100 flex flex-col gap-2 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading level={3} className="text-base">
              Worth knowing
            </Heading>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadText(`skipped-rows-${runId.slice(0, 8)}.csv`, problemsCsv(problems))
              }
            >
              <Download className="size-4" aria-hidden />
              Download this list
            </Button>
          </div>
          <div className="border-base-300 max-h-80 overflow-y-auto rounded-lg border px-3">
            {problems.map((problem, index) => (
              <div
                key={`${problem.entity}-${problem.rowIndex}-${index}`}
                className="border-base-300 flex items-start gap-3 border-b py-2 last:border-b-0"
              >
                <Badge
                  color={problem.status === 'error' ? 'danger' : 'info'}
                  variant="soft"
                  size="sm"
                  className="mt-0.5"
                >
                  {problem.status === 'error' ? 'Skipped' : 'Note'}
                </Badge>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Text className="text-sm">
                    {problem.naturalKey !== null ? `${problem.naturalKey} — ` : ''}
                    {problem.message}
                  </Text>
                  <Text className="text-sm">
                    Row {problem.rowIndex + 2} of your{' '}
                    {entityLabel(problem.entity as CanonicalEntity).toLowerCase()} file
                  </Text>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function MigrationRunSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const vendorParam = typeof ctx.params.vendor === 'string' ? ctx.params.vendor : undefined;
  const runParam = typeof ctx.params.runId === 'string' ? ctx.params.runId : null;

  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  /** The result of hand-mapping an unrecognised file. Null until it is usable. */
  const [manual, setManual] = useState<MappedEntity | null>(null);
  /** Rows pulled from a live connection, already validated by the same code a file
   *  goes through. Mutually exclusive with `loaded` — one errand, one source. */
  const [live, setLive] = useState<LivePull | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(runParam);
  const [reading, setReading] = useState(false);

  const start = useStartMigration();
  const { data: catalogue } = useMigrationVendors();
  const vendor = useMemo(
    () => (catalogue?.vendors ?? []).find((entry) => entry.slug === vendorParam),
    [catalogue, vendorParam]
  );

  const onFile = useCallback(async (file: File) => {
    setReading(true);
    setReadError(null);
    try {
      const result = await loadFile(file);
      setLoaded(result);
      // A new file invalidates any mapping built for the last one.
      setManual(null);
    } catch (error) {
      setLoaded(null);
      setManual(null);
      setReadError(error instanceof Error ? error.message : 'We could not read that file.');
    } finally {
      setReading(false);
    }
  }, []);

  // A recognised file brings its own entities; an unrecognised one brings whatever
  // the tenant mapped by hand. Both arrive here in the same shape, so everything
  // downstream — the count, the practice run, the import — is identical either way.
  const importable = useMemo(() => {
    const usable = (entities: MappedEntity[]): MappedEntity[] =>
      entities.filter((entity) => !entity.report.blocked && entity.report.okCount > 0);

    if (live !== null) return usable(live.entities);
    if (loaded === null) return [];
    if (loaded.result.detected === null) {
      return manual === null || manual.report.blocked || manual.report.okCount === 0
        ? []
        : [manual];
    }
    return usable(loaded.result.entities);
  }, [live, loaded, manual]);

  const totalReady = importable.reduce((sum, entity) => sum + entity.report.okCount, 0);

  const begin = useCallback(
    async (dryRun: boolean) => {
      if (importable.length === 0) return;
      // What the run reads back as later. A file is remembered by its name; a live
      // connection by whose account it was, which is the equivalent fact.
      const from =
        live !== null
          ? `Live connection · ${live.account}`
          : loaded === null
            ? undefined
            : loaded.name;
      const detectedVendor = loaded?.result.detected?.vendorSlug;

      try {
        const result = await start.mutateAsync({
          ...(vendorParam === undefined
            ? detectedVendor === undefined
              ? {}
              : { vendor: detectedVendor }
            : { vendor: vendorParam }),
          ...(from === undefined ? {} : { fileName: from }),
          dryRun,
          entities: importable.map((entity) => ({
            entity: entity.entity,
            // Only the rows that passed. The tenant was shown this count; sending
            // rows we already know will fail would make that count a lie.
            rows: entity.rows.filter((_row, index) => !entity.report.errorRows.includes(index)),
          })),
        });
        setRunId(result.runId);
        ctx.setTitle(dryRun ? 'Practice run' : 'Moving in');
        if (result.skipped.length > 0) {
          toast.add({
            title: 'Some of this file was left out',
            description: result.skipped
              .map(
                (skip) =>
                  `${entityLabel(skip.entity, skip.rows)} — the ${skip.module} module is switched off.`
              )
              .join(' '),
            type: 'info',
          });
        }
      } catch (error) {
        toast.add({
          title: 'That did not start',
          description: error instanceof Error ? error.message : 'Try again in a moment.',
          type: 'error',
        });
      }
    },
    [live, loaded, importable, start, vendorParam, ctx, toast]
  );

  const reset = useCallback(() => {
    setLoaded(null);
    setManual(null);
    setLive(null);
    setConnecting(false);
    setRunId(null);
    setReadError(null);
    if (inputRef.current !== null) inputRef.current.value = '';
  }, []);

  /** True once there is something to look at, from either source. */
  const staged = loaded !== null || live !== null;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Migration run controls"
        controls={
          <>
            {runId !== null ? (
              <Button variant="ghost" size="sm" onClick={reset}>
                <RotateCcw className="size-4" aria-hidden />
                Move something else
              </Button>
            ) : null}
            {staged && runId === null ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={importable.length === 0 || start.isPending}
                  onClick={() => void begin(true)}
                >
                  <Play className="size-4" aria-hidden />
                  Practice run
                </Button>
                <Button
                  color="primary"
                  size="sm"
                  disabled={importable.length === 0 || start.isPending}
                  onClick={() => void begin(false)}
                >
                  <Upload className="size-4" aria-hidden />
                  Bring in {totalReady.toLocaleString()}
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className={COLUMN}>
        {runId !== null ? (
          <RunProgress runId={runId} />
        ) : connecting ? (
          vendor === undefined ? null : (
            <LiveConnection
              vendor={vendor}
              onReady={(pull) => {
                setLive(pull);
                setConnecting(false);
                ctx.setTitle(`Moving from ${vendor.name}`);
              }}
              onCancel={() => {
                setConnecting(false);
              }}
            />
          )
        ) : !staged ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Heading level={2}>
                {vendor === undefined ? 'Bring in a file' : `Moving from ${vendor.name}`}
              </Heading>
              <Text>
                {vendor?.connector == null
                  ? 'Drop the export your current platform made. We read it right here on your own machine and tell you what is in it — nothing is sent anywhere until you say so.'
                  : `Two ways in, and they end up in the same place. Connect to ${vendor.name} and we fetch it for you, or drop an export in if you would rather. Either way you see exactly what will happen before anything is saved.`}
              </Text>
            </div>

            {/* The faster road first, when there is one. Everything on the roster
                works from a file; three platforms also answer to a key, and for
                those the export queue is a step nobody needs to take. */}
            {vendor?.connector == null ? null : (
              <ModuleScope module={vendorHue(vendor.kind)}>
                <div className="border-module bg-module bg-soft flex flex-col gap-3 rounded-xl border p-5">
                  <Heading level={3} className="text-base">
                    Connect to {vendor.name} and skip the exporting
                  </Heading>
                  <Text>
                    Paste one read-only key and we read your{' '}
                    {vendor.connector.resources
                      .slice(0, 3)
                      .map((resource) => resource.label.toLowerCase())
                      .join(', ')}
                    {vendor.connector.resources.length > 3 ? ' and more' : ''} straight from your
                    account. It takes about two minutes to set up and nothing is stored afterwards.
                  </Text>
                  <Button
                    color="module"
                    className="self-start"
                    onClick={() => {
                      setConnecting(true);
                    }}
                  >
                    <Plug className="size-4" aria-hidden />
                    Connect to {vendor.name}
                  </Button>
                </div>
              </ModuleScope>
            )}

            <label className="border-base-300 hover:border-primary flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors">
              <FileUp className="size-8" aria-hidden />
              <span className="flex flex-col gap-1">
                <Text className="font-medium">Choose a file, or drop one here</Text>
                <Text className="text-sm">CSV, XML or JSON — whatever your platform gave you.</Text>
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.tsv,.xml,.json,text/csv,text/xml,application/json"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file !== undefined) void onFile(file);
                }}
              />
            </label>

            {reading ? (
              <Text>
                <Loader2 className="mr-2 inline size-4 animate-spin" aria-hidden />
                Reading it…
              </Text>
            ) : null}

            {readError !== null ? (
              <Alert color="danger" variant="soft">
                <AlertContent>
                  <AlertTitle>We could not read that file</AlertTitle>
                  <AlertDescription>{readError}</AlertDescription>
                  {/* A file we cannot read is the one failure the tenant genuinely
                      cannot fix alone — they exported what their platform gave them.
                      Sending it to us is the correct next move, not a last resort. */}
                  <ReportProblemButton
                    className="mt-3 self-start"
                    label="Send this to us"
                    subject="sparx could not read my export file"
                    details={[
                      `Moving from: ${vendor?.name ?? 'not chosen'}`,
                      `What the screen said: ${readError}`,
                    ].join('\n')}
                  />
                </AlertContent>
              </Alert>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level={2}>{live === null ? loaded?.name : live.account}</Heading>
              <Badge color="neutral" variant="outline" size="sm">
                {live === null
                  ? `${((loaded?.sizeBytes ?? 0) / 1024).toFixed(0)} KB`
                  : 'Read live, nothing stored'}
              </Badge>
              <Button variant="ghost" size="sm" onClick={reset} className="ml-auto">
                <RotateCcw className="size-4" aria-hidden />
                {live === null ? 'Use a different file' : 'Start again'}
              </Button>
            </div>

            {live === null ? (
              loaded === null ? null : (
                <FileReport loaded={loaded} onManual={setManual} />
              )
            ) : (
              <div className="flex flex-col gap-4">
                <Alert color="success" variant="soft">
                  <AlertContent>
                    <AlertTitle>Read from {live.account}</AlertTitle>
                    <AlertDescription>
                      This is everything we found, checked the same way a file is. Nothing has been
                      saved to your business yet.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
                {live.entities.map((mapped) => (
                  <EntityReport key={mapped.entity} mapped={mapped} />
                ))}
              </div>
            )}

            {importable.length === 0 ? (
              <Alert color="danger" variant="soft">
                <AlertContent>
                  <AlertTitle>
                    <CircleAlert className="mr-2 inline size-4" aria-hidden />
                    {live === null
                      ? 'Nothing in this file can come across yet'
                      : 'Nothing we found can come across yet'}
                  </AlertTitle>
                  <AlertDescription>
                    {live === null
                      ? 'Fix the problems listed above in your spreadsheet, then drop it in again.'
                      : 'Every record we read has a problem listed above. Fixing them on your old platform and connecting again is the quickest way through.'}
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : (
              <Alert color="info">
                <AlertContent>
                  <AlertTitle>
                    <TriangleAlert className="mr-2 inline size-4" aria-hidden />
                    Try a practice run first
                  </AlertTitle>
                  <AlertDescription>
                    It checks every row against what you already have and shows you exactly what
                    would happen, without saving anything.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
