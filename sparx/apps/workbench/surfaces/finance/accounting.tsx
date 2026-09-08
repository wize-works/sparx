'use client';

// ACCOUNTING — getting your numbers into whoever actually keeps the books.
//
// sparx does not do bookkeeping and never will: no ledger, no chart of accounts,
// no reconciliation, no tax filing. That is a permanent product position, not a
// gap waiting to be filled, and this screen is where it is honoured rather than
// apologised for. The promise is that everything recorded here leaves cleanly for
// QuickBooks, Sage 50, Xero, or an accountant who just wants the spreadsheet.
//
// SO THE SCREEN LEADS WITH THE EXPORT, not with a list of integrations that are
// mostly not built yet. The export works today, for every package, and it is the
// thing someone came here to do. Direct sync is listed underneath with an honest
// label on each — "does sparx work with Xero?" deserves an answer, and "not yet,
// and here is what works today instead" is a better one than an empty list.
//
// IMPORT NEVER WRITES BEFORE IT SHOWS. A CSV is previewed row by row, with the
// errors named and the total spelled out, and only then committed. An import that
// wrote 300 rows and then reported what it did is unrecoverable in practice.
//
// "BOOKS CLOSED ON" IS THE MOST IMPORTANT FIELD HERE. Nothing before that date is
// ever exported again, which is what stops a re-export re-posting a period the
// accountant has already closed — the single thing that would make a bookkeeper
// stop trusting the feed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Table,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Check, Download, Link2, LogIn, LogOut, Plug, Save, Trash2, Upload } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import {
  downloadAccountingExport,
  spendErrorMessage,
  useAccounting,
  useCommitImport,
  useCompleteAccountingConnect,
  useDeleteConnection,
  useDisconnectAccounting,
  useExpenseCategories,
  useImportPreview,
  useMappings,
  useSaveConnection,
  useSaveMappings,
  useStartAccountingConnect,
  useSyncRuns,
  type AccountingConnection,
  type AccountingProvider,
  type ImportPreview,
} from './spend-data';
import { PERIOD_OPTIONS, rangeFor, type PeriodKey } from './period';
import { formatCents, formatDateTime, formatDay, kindColor } from './format';

/* ── Export ─────────────────────────────────────────────────────────────────*/

function ExportPanel({
  catalog,
  connections,
}: {
  catalog: AccountingProvider[];
  connections: AccountingConnection[];
}) {
  const toast = useToast();
  const addRow = useSaveConnection();
  const [period, setPeriod] = useState<PeriodKey>('last_month');
  const [provider, setProvider] = useState('csv');
  const [connectionId, setConnectionId] = useState('');
  const [markSent, setMarkSent] = useState(true);
  const [busy, setBusy] = useState(false);

  const range = useMemo(() => rangeFor(period), [period]);
  const descriptor = catalog.find((entry) => entry.provider === provider);
  const usable = catalog.filter((entry) => entry.availability === 'available');
  const existing = connections.find((connection) => connection.provider === provider);

  /**
   * Set up account codes for the layout being exported.
   *
   * THIS EXISTS BECAUSE THE SETTINGS WERE UNREACHABLE. A connection row is what
   * holds the books-closed date and the category → account-code mapping, and the
   * only control that created one lived in the "Sending it automatically" list —
   * which deliberately excludes `csv`, the one provider that is actually
   * available. So the two things this screen's own header calls the most
   * important field here and "the whole reason the export is worth anything to a
   * bookkeeper" could not be reached by anybody, and every tenant exported raw
   * category names forever.
   *
   * It belongs on the EXPORT panel rather than in that list because the list is
   * about automatic sending and this is not automatic — it is the settings for
   * the file you are about to download, offered where somebody is standing when
   * they care about them. Only providers in `usable` can be chosen above, and
   * `upsertConnection` refuses anything not available, so this cannot offer a
   * setup that would throw.
   */
  const setUpCodes = () => {
    if (!descriptor) return;
    addRow.mutate(
      { provider, displayName: descriptor.name, syncCadence: 'manual' },
      {
        onSuccess: (created) => {
          setConnectionId(created.id);
          afterPaneChange(() => {
            toast.add({
              title: `Account codes for ${descriptor.name}`,
              description:
                'Set your books-closed date and map each category to their account code below.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not set that up',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const run = async () => {
    setBusy(true);
    try {
      const result = await downloadAccountingExport({
        provider,
        from: range.from,
        to: range.to,
        connectionId: connectionId === '' ? null : connectionId,
        markSent,
      });
      afterPaneChange(() => {
        toast.add({
          title: `${result.filename} downloaded`,
          // Rows the server left out are surfaced, never dropped — a download
          // cannot carry a warning, and silence would read as "all of it".
          description:
            result.skipped > 0
              ? `${String(result.skipped)} ${result.skipped === 1 ? 'cost was' : 'costs were'} left out — usually because they fall before your books-closed date.`
              : 'Every cost in that period is in the file.',
          type: result.skipped > 0 ? 'warning' : 'success',
        });
      });
    } catch (error) {
      toast.add({
        title: 'Could not build the export',
        description: spendErrorMessage(error, 'Nothing was downloaded or changed.'),
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSection
      title="Send your spending to your accountant"
      description="A file with every cost in the period, one row each, with the columns your accounting package expects. This works today with every package on the list."
    >
      <div className="grid gap-3 @md:grid-cols-2">
        <Field>
          <FieldLabel>Period</FieldLabel>
          <FieldControl
            render={
              <NativeSelect
                color="module"
                value={period}
                onChange={(event) => {
                  setPeriod(event.target.value as PeriodKey);
                }}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            }
          />
          <FieldDescription>
            {formatDay(range.from)} to {formatDay(range.to)}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Laid out for</FieldLabel>
          <FieldControl
            render={
              <NativeSelect
                color="module"
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value);
                }}
              >
                {usable.map((entry) => (
                  <option key={entry.provider} value={entry.provider}>
                    {entry.name}
                  </option>
                ))}
              </NativeSelect>
            }
          />
        </Field>

        {connections.length > 0 ? (
          <Field className="@md:col-span-2">
            <FieldLabel>Use the settings from</FieldLabel>
            <FieldControl
              render={
                <NativeSelect
                  color="module"
                  value={connectionId}
                  onChange={(event) => {
                    setConnectionId(event.target.value);
                  }}
                >
                  <option value="">Just the category names</option>
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.displayName ?? connection.provider}
                    </option>
                  ))}
                </NativeSelect>
              }
            />
            <FieldDescription>
              Uses that connection&apos;s account codes and respects its books-closed date.
            </FieldDescription>
          </Field>
        ) : null}
      </div>

      {/* The offer only appears when this layout has no settings yet. Once it
          does, the card below IS the affordance and a second entry point would
          just be a way to create a duplicate. */}
      {descriptor && !existing ? (
        <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="flex min-w-0 flex-col">
            <Text className="text-sm font-medium">
              Tell sparx your accountant&apos;s account codes
            </Text>
            <Text className="text-sm">
              Right now every cost goes out under your own category name, and somebody re-files it
              at the other end. Map each one once and it arrives ready to post — and set the date
              your books are closed through, so a re-send can never re-post a period they have
              already finished.
            </Text>
          </div>
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            loading={addRow.isPending}
            onClick={setUpCodes}
          >
            <Save className="size-4" aria-hidden />
            Set up account codes
          </Button>
        </div>
      ) : null}

      {descriptor ? (
        <div className="border-base-300 flex flex-col gap-2 rounded-lg border p-3">
          <Text className="text-sm font-medium">Columns in the file</Text>
          <div className="flex flex-wrap gap-1.5">
            {descriptor.exportColumns.map((column) => (
              <Badge key={column} color="neutral" variant="soft" size="sm">
                {column}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        <Checkbox
          id="accounting-mark-sent"
          color="module"
          className="mt-0.5"
          checked={markSent}
          onChange={(event) => {
            setMarkSent(event.target.checked);
          }}
        />
        <label htmlFor="accounting-mark-sent" className="flex flex-col">
          <span className="font-medium">Mark these as sent</span>
          <span className="text-sm">
            Stamps each cost so you can tell later what has already gone to your accountant and what
            has not. Leave it off for a scratch copy you are not going to send.
          </span>
        </label>
      </div>

      <div>
        <Button size="sm" color="module" loading={busy} onClick={() => void run()}>
          <Download className="size-4" aria-hidden />
          Download the file
        </Button>
      </div>
    </FormSection>
  );
}

/* ── Import ─────────────────────────────────────────────────────────────────*/

const COLUMN_FIELDS = [
  { key: 'date', label: 'Date', required: true, hint: 'When the cost happened' },
  { key: 'description', label: 'What it was for', required: true, hint: 'The description column' },
  { key: 'amount', label: 'Amount', required: true, hint: 'The money column' },
  { key: 'vendor', label: 'Who you paid', required: false, hint: 'Optional' },
  { key: 'reference', label: 'Reference', required: false, hint: 'Optional' },
  { key: 'category', label: 'Category', required: false, hint: 'Optional' },
] as const;

function ImportPanel({ categories }: { categories: { id: string; name: string }[] }) {
  const toast = useToast();
  const preview = useImportPreview();
  const commit = useCommitImport();

  const [csv, setCsv] = useState('');
  const [columns, setColumns] = useState<Record<string, string>>({});
  const [fallbackCategoryId, setFallbackCategoryId] = useState('');
  const [invertAmounts, setInvertAmounts] = useState(false);
  const [sourceKey, setSourceKey] = useState('');
  const [result, setResult] = useState<ImportPreview | null>(null);

  // Header names come from the pasted file itself — a dropdown of real column
  // names beats asking someone to type "Transaction Date" exactly.
  const headers = useMemo(() => {
    const firstLine = csv.split(/\r?\n/)[0] ?? '';
    if (firstLine.trim() === '') return [];
    return firstLine.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''));
  }, [csv]);

  const mappedOk =
    (columns.date ?? '') !== '' &&
    (columns.description ?? '') !== '' &&
    (columns.amount ?? '') !== '';
  const canPreview = csv.trim() !== '' && mappedOk && fallbackCategoryId !== '';

  const body = () => ({
    csv,
    columns: {
      date: columns.date ?? '',
      description: columns.description ?? '',
      amount: columns.amount ?? '',
      ...(columns.vendor ? { vendor: columns.vendor } : {}),
      ...(columns.reference ? { reference: columns.reference } : {}),
      ...(columns.category ? { category: columns.category } : {}),
    },
    fallbackCategoryId,
    invertAmounts,
    sourceKey:
      sourceKey.trim() === ''
        ? `import-${new Date().toISOString().slice(0, 10)}`
        : sourceKey.trim(),
  });

  const runPreview = () => {
    if (!canPreview) return;
    preview.mutate(body(), {
      onSuccess: setResult,
      onError: (error) => {
        toast.add({
          title: 'Could not read that file',
          description: spendErrorMessage(error, 'Nothing was imported.'),
          type: 'error',
        });
      },
    });
  };

  const runCommit = () => {
    commit.mutate(body(), {
      onSuccess: (outcome) => {
        setResult(null);
        setCsv('');
        afterPaneChange(() => {
          toast.add({
            title: `${String(outcome.imported)} ${outcome.imported === 1 ? 'cost' : 'costs'} imported`,
            description:
              outcome.skipped > 0
                ? `${String(outcome.skipped)} were skipped because they had already been imported.`
                : 'They are in your spending list now.',
            type: 'success',
          });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not import that file',
          description: spendErrorMessage(error, 'Nothing was imported.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <FormSection
      title="Bring spending in from somewhere else"
      description="Paste a spreadsheet export from your bank or your old system. Nothing is written until you have seen exactly what it will do."
    >
      <Field>
        <FieldLabel>The file</FieldLabel>
        <FieldControl
          render={
            <Textarea
              color="module"
              rows={6}
              value={csv}
              spellCheck={false}
              placeholder={'Date,Description,Amount\n2026-01-04,Fuel,54.20'}
              className="font-mono text-sm"
              onChange={(event) => {
                setCsv(event.target.value);
                setResult(null);
              }}
            />
          }
        />
        <FieldDescription>
          Open the CSV in a spreadsheet, select everything including the header row, and paste it
          here.
        </FieldDescription>
      </Field>

      {headers.length > 0 ? (
        <>
          <div className="grid gap-3 @md:grid-cols-2">
            {COLUMN_FIELDS.map((field) => (
              <Field key={field.key}>
                <FieldLabel required={field.required}>{field.label}</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      color="module"
                      value={columns[field.key] ?? ''}
                      onChange={(event) => {
                        setColumns((current) => ({ ...current, [field.key]: event.target.value }));
                        setResult(null);
                      }}
                    >
                      <option value="">Not in the file</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </NativeSelect>
                  }
                />
                <FieldDescription>{field.hint}</FieldDescription>
              </Field>
            ))}

            <Field>
              <FieldLabel required>File anything unmatched under</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    color="module"
                    value={fallbackCategoryId}
                    onChange={(event) => {
                      setFallbackCategoryId(event.target.value);
                      setResult(null);
                    }}
                  >
                    <option value="">Choose a category…</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
              <FieldDescription>
                Rows whose category does not match one of yours land here, so nothing is dropped.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Name this import</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={sourceKey}
                    spellCheck={false}
                    placeholder="bank-january"
                    onChange={(event) => {
                      setSourceKey(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                Used to spot rows you have already imported, so running the same file twice does not
                double your costs.
              </FieldDescription>
            </Field>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="import-invert-amounts"
              color="module"
              className="mt-0.5"
              checked={invertAmounts}
              onChange={(event) => {
                setInvertAmounts(event.target.checked);
                setResult(null);
              }}
            />
            <label htmlFor="import-invert-amounts" className="flex flex-col">
              <span className="font-medium">Amounts are negative in this file</span>
              <span className="text-sm">
                Bank exports usually show money going out as a negative. Tick this and they come in
                as costs rather than as refunds.
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              disabled={!canPreview}
              loading={preview.isPending}
              onClick={runPreview}
            >
              <Upload className="size-4" aria-hidden />
              Check the file
            </Button>
            {result ? (
              <Button
                size="sm"
                color="module"
                disabled={result.validCount === 0}
                loading={commit.isPending}
                onClick={runCommit}
              >
                <Check className="size-4" aria-hidden />
                Import {String(result.validCount)} {result.validCount === 1 ? 'cost' : 'costs'}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="success" variant="soft">
              {String(result.validCount)} ready
            </Badge>
            {result.errorCount > 0 ? (
              <Badge color="danger" variant="soft">
                {String(result.errorCount)} cannot be read
              </Badge>
            ) : null}
            <Text className="text-sm">
              Totalling {formatCents(result.totalCents)} — nothing has been saved yet.
            </Text>
          </div>

          {result.errorCount > 0 ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>Some rows will be left out</AlertTitle>
                <AlertDescription>
                  Importing brings in the rows that can be read and skips the rest. Fix them in the
                  spreadsheet and paste it again if you need all of it.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          <Card className="overflow-hidden">
            <Table size="sm">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Date</th>
                  <th>What for</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.slice(0, 25).map((row) => (
                  <tr key={row.line}>
                    <td className="tabular-nums">{row.line}</td>
                    <td className="whitespace-nowrap">
                      {row.error ? (
                        <Badge color="danger" variant="soft" size="sm">
                          {row.error}
                        </Badge>
                      ) : (
                        formatDay(row.incurredAt)
                      )}
                    </td>
                    <td className="max-w-56 truncate">{row.description}</td>
                    <td className="text-right tabular-nums">
                      {row.amountCents === null ? '—' : formatCents(row.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {result.rows.length > 25 ? (
            <Text className="text-sm">
              Showing the first 25 of {String(result.rows.length)} rows.
            </Text>
          ) : null}
        </div>
      ) : null}
    </FormSection>
  );
}

/* ── The OAuth round trip ───────────────────────────────────────────────────*/

/** The shape `app/finance/accounting/callback` posts back through `window.opener`. */
interface CallbackMessage {
  source: 'sparx-accounting';
  code?: string;
  state?: string;
  error?: string;
  params?: Record<string, string>;
}

function isCallbackMessage(value: unknown): value is CallbackMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { source?: unknown }).source === 'sparx-accounting'
  );
}

/**
 * Signing in to QuickBooks Online or Xero, end to end.
 *
 * Three server calls in a fixed order, because the connection ROW has to exist
 * before the redirect: its id rides inside the signed `state` and is where the
 * callback writes the grant. Abandoning the consent screen therefore leaves a
 * visible, deletable row that says "not signed in" rather than nothing at all.
 *
 * THE POPUP IS OPENED SYNCHRONOUSLY, before either request. A window opened
 * later — in a promise callback — is an unsolicited pop-up as far as the browser
 * is concerned, and gets blocked. So it opens blank on the click and is pointed
 * at the provider once the URL comes back, which is the same thing the social
 * connections pane does for the same reason.
 *
 * There is no `window.location.href` fallback for a blocked popup here, unlike
 * social: this pane can hold a half-typed account-code mapping, and navigating
 * the whole workbench away to a consent screen would discard it silently. A
 * blocked popup is reported instead.
 */
function useAccountingConnect() {
  const toast = useToast();
  const saveConnection = useSaveConnection();
  const startConnect = useStartAccountingConnect();
  const completeConnect = useCompleteAccountingConnect();

  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const complete = useCallback(
    (message: CallbackMessage) => {
      if (!message.code || !message.state) return;
      completeConnect.mutate(
        {
          code: message.code,
          state: message.state,
          ...(message.params && Object.keys(message.params).length > 0
            ? { params: message.params }
            : {}),
        },
        {
          onSuccess: (connection) => {
            setPendingProvider(null);
            afterPaneChange(() => {
              toast.add({
                title: `${connection.displayName ?? connection.provider} connected`,
                description:
                  'Set your books-closed date and map your categories so the first send lands in the right accounts.',
                type: 'success',
              });
            });
          },
          onError: (error) => {
            setPendingProvider(null);
            setFailure(
              spendErrorMessage(
                error,
                'Could not finish connecting. Nothing was changed, and you can try again.'
              )
            );
          },
        }
      );
    },
    [completeConnect, toast]
  );

  // The listener is registered once and reads the latest `complete` through a
  // ref — re-subscribing on every render would drop a message that arrived
  // between teardown and re-add, which is exactly when the popup posts.
  const completeRef = useRef(complete);
  completeRef.current = complete;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isCallbackMessage(event.data)) return;
      if (event.data.error) {
        setPendingProvider(null);
        setFailure(
          event.data.error === 'access_denied'
            ? 'You cancelled the sign-in, so nothing was connected.'
            : `Your accounting provider reported a problem: ${event.data.error}`
        );
        return;
      }
      completeRef.current(event.data);
    }
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  /** Start (or resume) a sign-in. Pass an existing row's id to finish one that
   *  was abandoned, rather than writing a second row for the same provider. */
  const begin = useCallback(
    (input: { provider: string; displayName: string; connectionId?: string }) => {
      setFailure(null);
      setPendingProvider(input.provider);

      const popup = window.open('', 'sparx-accounting-connect', 'width=620,height=760');
      if (!popup) {
        setPendingProvider(null);
        setFailure(
          'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
        );
        return;
      }

      void (async () => {
        try {
          const id =
            input.connectionId ??
            (
              await saveConnection.mutateAsync({
                provider: input.provider,
                displayName: input.displayName,
                syncCadence: 'manual',
              })
            ).id;
          const { url } = await startConnect.mutateAsync({
            id,
            redirectUri: `${window.location.origin}/finance/accounting/callback`,
          });
          popup.location.href = url;
        } catch (error) {
          popup.close();
          setPendingProvider(null);
          setFailure(spendErrorMessage(error, 'Could not start the sign-in. Nothing was changed.'));
        }
      })();
    },
    [saveConnection, startConnect]
  );

  return {
    begin,
    pendingProvider,
    failure,
    dismissFailure: () => {
      setFailure(null);
    },
    isFinishing: completeConnect.isPending,
  };
}

/* ── Connections ────────────────────────────────────────────────────────────*/

/**
 * Category → their account code.
 *
 * The whole reason the export is worth anything to a bookkeeper. Without it,
 * every cost lands in their books under whatever sparx happened to call the
 * category ("Fuel"), and someone re-files all of it by hand every month. With
 * it, "Fuel" arrives as `6420` and posts straight to the right account.
 *
 * Left blank is a REAL and fine answer, not an unfinished row: `accountFor`
 * falls back to the category's export code and then to its name, so an unmapped
 * category still exports something a human recognises rather than a blank column
 * or a failed row. The screen says so, because otherwise a half-filled table
 * looks like a job someone abandoned.
 */
function MappingTable({ connectionId }: { connectionId: string }) {
  const toast = useToast();
  const categories = useExpenseCategories();
  const saved = useMappings(connectionId);
  const saveMappings = useSaveMappings(connectionId);

  // Category id → the code typed against it. Seeded from the server once loaded;
  // `dirty` guards the seed so typing is never overwritten by a background refetch.
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty || !saved.data) return;
    const next: Record<string, string> = {};
    for (const mapping of saved.data) {
      if (mapping.sparxType !== 'expense_category') continue;
      next[mapping.sparxId] = mapping.externalCode ?? mapping.externalName ?? '';
    }
    setCodes(next);
  }, [saved.data, dirty]);

  const rows = (categories.data ?? []).filter((category) => category.archivedAt === null);

  const onSave = () => {
    saveMappings.mutate(
      rows
        // Only send rows that carry a code. A blank is "no mapping", and writing
        // an empty mapping row would be indistinguishable from one at read time
        // while still counting as a saved decision.
        .filter((category) => (codes[category.id] ?? '').trim() !== '')
        .map((category) => ({
          sparxType: 'expense_category' as const,
          sparxId: category.id,
          categoryId: category.id,
          externalId: codes[category.id]!.trim(),
          externalCode: codes[category.id]!.trim(),
          externalName: category.name,
        })),
      {
        onSuccess: (result) => {
          setDirty(false);
          afterPaneChange(() => {
            toast.add({
              title:
                result.saved === 0
                  ? 'Nothing mapped yet'
                  : `${String(result.saved)} ${result.saved === 1 ? 'category' : 'categories'} mapped`,
              description:
                result.saved === 0
                  ? 'Exports will use your own category names, which still works.'
                  : 'Your next export will use these codes.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save the mapping',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  if (rows.length === 0) return null;

  const mappedCount = rows.filter((c) => (codes[c.id] ?? '').trim() !== '').length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text className="text-sm font-medium">Where each cost lands in their books</Text>
        <Badge color={mappedCount === 0 ? 'neutral' : 'module'} variant="soft" size="sm">
          {mappedCount} of {rows.length} mapped
        </Badge>
      </div>

      <Text className="text-sm">
        Type the account code your accountant uses for each kind of cost. Leave any of them blank
        and the export sends the category name instead — that still works, it just means someone
        files it at the other end.
      </Text>

      <Card className="overflow-hidden">
        <Table size="sm">
          <thead>
            <tr>
              <th>Your category</th>
              <th>Their account code</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((category) => (
              <tr key={category.id}>
                <td>
                  <Badge color={kindColor(category.kind)} variant="soft" size="sm">
                    {category.name}
                  </Badge>
                </td>
                <td>
                  <Input
                    color="module"
                    size="sm"
                    spellCheck={false}
                    aria-label={`Account code for ${category.name}`}
                    placeholder={category.exportCode ?? 'e.g. 6420'}
                    value={codes[category.id] ?? ''}
                    onChange={(event) => {
                      setDirty(true);
                      setCodes((current) => ({ ...current, [category.id]: event.target.value }));
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <div>
        <Button
          size="sm"
          color="module"
          disabled={!dirty}
          loading={saveMappings.isPending}
          onClick={onSave}
        >
          <Save className="size-4" aria-hidden />
          Save the mapping
        </Button>
      </div>
    </div>
  );
}

function ConnectionCard({
  connection,
  isOauth,
  signingIn,
  onSignIn,
}: {
  connection: AccountingConnection;
  /** Whether this provider signs in at all. A spreadsheet layout does not — its
   *  row exists only to hold the books-closed date and the account mapping. */
  isOauth: boolean;
  signingIn: boolean;
  onSignIn: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const save = useSaveConnection();
  const remove = useDeleteConnection();
  const signOut = useDisconnectAccounting();
  const runs = useSyncRuns(connection.id);

  const [closedOn, setClosedOn] = useState(
    connection.syncFromDate ? connection.syncFromDate.slice(0, 10) : ''
  );

  const saveClosedOn = () => {
    save.mutate(
      {
        provider: connection.provider,
        displayName: connection.displayName,
        syncCadence: connection.syncCadence as 'manual' | 'daily' | 'weekly',
        syncFromDate: closedOn === '' ? null : new Date(`${closedOn}T00:00:00.000Z`).toISOString(),
      },
      {
        onSuccess: () => {
          afterPaneChange(() => {
            toast.add({ title: 'Saved', type: 'success' });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const name = connection.displayName ?? connection.provider;

  // Signing OUT forgets the grant and keeps everything else. Removing deletes
  // the row, and with it the account mapping and the books-closed date — which
  // is why they are two different actions with two different confirmations
  // rather than one button whose blast radius depends on hidden state.
  const onSignOut = async () => {
    const ok = await confirm({
      title: `Sign out of ${name}?`,
      description:
        'sparx forgets the sign-in and stops sending anything automatically. Your account codes, your books-closed date and everything already sent all stay exactly as they are — sign in again any time and nothing needs redoing.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
      color: 'danger',
    });
    if (!ok) return;
    signOut.mutate(connection.id, {
      onSuccess: () => {
        afterPaneChange(() => {
          toast.add({
            title: `Signed out of ${name}`,
            description: 'Your account codes and books-closed date are still here.',
            type: 'success',
          });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not sign out',
          description: spendErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const onRemove = async () => {
    const ok = await confirm({
      title: `Remove ${name}?`,
      description: connection.connected
        ? 'This signs sparx out AND deletes the account codes you mapped and your books-closed date. Nothing already sent is recalled and none of your spending is deleted, but the setup work is gone and would have to be done again.'
        : 'This deletes the account codes you mapped and your books-closed date. Nothing already sent is recalled and none of your spending is deleted, but the setup work is gone and would have to be done again.',
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(connection.id, {
      onSuccess: () => {
        afterPaneChange(() => {
          toast.add({ title: `Removed ${name}`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove that',
          description: spendErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text className="font-medium">{name}</Text>
            {/* Sign-in state is read from `connected`, never from `status` —
                `status` is 'active' from the instant the row is written, which
                is before the provider has seen anything. A spreadsheet layout
                has no sign-in at all, so it says what it actually is instead of
                wearing a warning badge forever. */}
            {!isOauth ? (
              <Badge color="module" variant="soft" size="sm">
                Export layout
              </Badge>
            ) : connection.connected ? (
              <Badge color="success" variant="soft" size="sm">
                Signed in
              </Badge>
            ) : (
              <Badge color="warning" size="sm">
                Not signed in
              </Badge>
            )}
          </div>
          <Text className="text-sm">
            {isOauth && !connection.connected
              ? 'Set up, but sparx cannot send anything until you sign in.'
              : connection.lastSyncAt
                ? `Last sent ${formatDateTime(connection.lastSyncAt)}`
                : 'Nothing sent through this yet'}
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isOauth ? (
            connection.connected ? (
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                loading={signOut.isPending}
                onClick={() => {
                  void onSignOut();
                }}
              >
                <LogOut className="size-4" aria-hidden />
                Sign out
              </Button>
            ) : (
              <Button size="sm" color="module" loading={signingIn} onClick={onSignIn}>
                <LogIn className="size-4" aria-hidden />
                Sign in
              </Button>
            )
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            color="danger"
            shape="square"
            aria-label={`Remove ${name}`}
            loading={remove.isPending}
            onClick={() => {
              void onRemove();
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <Field>
        <FieldLabel>Books closed on</FieldLabel>
        <div className="flex flex-wrap items-center gap-2">
          <FieldControl
            render={
              <Input
                color="module"
                type="date"
                value={closedOn}
                className="max-w-48"
                onChange={(event) => {
                  setClosedOn(event.target.value);
                }}
              />
            }
          />
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            loading={save.isPending}
            onClick={saveClosedOn}
          >
            Save
          </Button>
        </div>
        <FieldDescription>
          Nothing dated before this is ever sent again, however many times you export. This is what
          stops a re-send re-posting a period your accountant has already closed.
        </FieldDescription>
      </Field>

      <MappingTable connectionId={connection.id} />

      {(runs.data ?? []).length > 0 ? (
        <div className="flex flex-col gap-2">
          <Text className="text-sm font-medium">Recent sends</Text>
          <ul className="flex flex-col gap-1">
            {(runs.data ?? []).slice(0, 5).map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>{formatDateTime(run.startedAt)}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">
                    {String(run.recordsSynced)} sent
                    {run.recordsSkipped > 0 ? ` · ${String(run.recordsSkipped)} left out` : ''}
                  </span>
                  <Badge
                    color={
                      run.recordsFailed > 0
                        ? 'danger'
                        : run.recordsSkipped > 0
                          ? 'warning'
                          : 'success'
                    }
                    variant="soft"
                    size="sm"
                  >
                    {run.recordsFailed > 0 ? 'Problems' : 'Done'}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────────*/

export function AccountingSurface() {
  const toast = useToast();
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useAccounting();
  const categories = useExpenseCategories();
  const addRow = useSaveConnection();
  const oauth = useAccountingConnect();

  const catalog = data?.catalog ?? [];
  const connections = data?.connections ?? [];
  const rowByProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  const isOauthProvider = (provider: string) =>
    catalog.find((entry) => entry.provider === provider)?.connect === 'oauth';

  /** A spreadsheet layout has no sign-in. Its row exists purely to hold the
   *  books-closed date and the category → account-code mapping, both of which
   *  the export reads — so setting one up is a single write and nothing else. */
  const setUpFileLayout = (provider: AccountingProvider) => {
    addRow.mutate(
      { provider: provider.provider, displayName: provider.name, syncCadence: 'manual' },
      {
        onSuccess: () => {
          afterPaneChange(() => {
            toast.add({
              title: `${provider.name} set up`,
              description:
                'Set your books-closed date and map your categories so the export lands in the right accounts.',
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not set that up',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Accounting controls"
        status={
          <span className="inline-flex items-center gap-1.5">
            <Plug className="size-4" aria-hidden />
            <Text as="span" className="text-sm font-medium">
              Your accounting package
            </Text>
          </span>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <div className="p-4">
            <Alert color="danger" variant="soft">
              <AlertContent>
                <AlertDescription>
                  Could not load your accounting settings. The server could not be reached.
                </AlertDescription>
              </AlertContent>
              <Button
                size="sm"
                color="danger"
                variant="soft"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            </Alert>
          </div>
        ) : isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {/* The position, said plainly and once, at the top. Someone arriving
                here wondering whether sparx replaces their accountant deserves
                the answer before they start looking for a ledger. */}
            <Card className="p-4">
              <Heading level={2} className="text-lg font-semibold">
                sparx is not your accounting package
              </Heading>
              <Text className="mt-1 text-sm">
                It records what you spend and what each job made, so you can run the business. Your
                books, your tax and your filings stay with QuickBooks, Sage 50, Xero or your
                accountant — and everything here leaves cleanly for them.
              </Text>
            </Card>

            <ExportPanel catalog={catalog} connections={connections} />

            <ImportPanel categories={categories.data ?? []} />

            {/* A failed sign-in is reported HERE rather than as a toast: the
                popup may have closed minutes ago, and "you cancelled" needs to
                stay on screen next to the button that starts it again. */}
            {oauth.failure ? (
              <Alert color="danger" variant="soft">
                <AlertContent>
                  <AlertTitle>Could not connect</AlertTitle>
                  <AlertDescription>{oauth.failure}</AlertDescription>
                </AlertContent>
                <Button size="sm" color="danger" variant="soft" onClick={oauth.dismissFailure}>
                  Dismiss
                </Button>
              </Alert>
            ) : null}

            {connections.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Heading level={2} className="px-1 text-lg font-semibold">
                  Set up
                </Heading>
                {connections.map((connection) => (
                  <ConnectionCard
                    key={connection.id}
                    connection={connection}
                    isOauth={isOauthProvider(connection.provider)}
                    signingIn={
                      oauth.pendingProvider === connection.provider ||
                      (oauth.isFinishing && oauth.pendingProvider !== null)
                    }
                    onSignIn={() => {
                      oauth.begin({
                        provider: connection.provider,
                        displayName: connection.displayName ?? connection.provider,
                        connectionId: connection.id,
                      });
                    }}
                  />
                ))}
              </div>
            ) : null}

            <FormSection
              title="Sending it automatically"
              description="Direct sync means sparx posts each cost for you instead of you moving a file. Where it is not switched on yet, the export above already works with that package today."
            >
              <ul className="flex flex-col gap-2">
                {catalog
                  .filter((entry) => entry.connect === 'oauth' || entry.provider !== 'csv')
                  .map((entry) => {
                    const ready = entry.availability === 'available';
                    const row = rowByProvider.get(entry.provider);
                    const isOauth = entry.connect === 'oauth';
                    const signedIn = row?.connected ?? false;
                    const busy = oauth.pendingProvider === entry.provider;

                    // Four states, and each one gets its own words. "Connect" on
                    // a row that already exists but was never signed in used to
                    // be disabled, which left the only way forward looking like
                    // a dead end.
                    const label = !isOauth
                      ? row
                        ? 'Set up'
                        : 'Set up'
                      : signedIn
                        ? 'Signed in'
                        : row
                          ? 'Finish signing in'
                          : 'Connect';

                    return (
                      <li
                        key={entry.provider}
                        className="border-base-300 flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Text className="font-medium">{entry.name}</Text>
                            <Badge color={ready ? 'success' : 'neutral'} variant="soft" size="sm">
                              {ready ? 'Ready' : 'Not yet'}
                            </Badge>
                            {signedIn ? (
                              <Badge color="module" variant="soft" size="sm">
                                Signed in
                              </Badge>
                            ) : row ? (
                              <Badge color="warning" size="sm">
                                Not signed in
                              </Badge>
                            ) : null}
                          </div>
                          <Text className="text-sm">
                            {ready ? entry.blurb : (entry.unavailableReason ?? entry.blurb)}
                          </Text>
                        </div>
                        <Button
                          size="sm"
                          variant={signedIn ? 'outline' : 'solid'}
                          color={signedIn ? 'neutral' : 'module'}
                          disabled={!ready || signedIn || (!isOauth && row !== undefined)}
                          loading={isOauth ? busy : addRow.isPending}
                          onClick={() => {
                            if (isOauth) {
                              oauth.begin({
                                provider: entry.provider,
                                displayName: entry.name,
                                ...(row ? { connectionId: row.id } : {}),
                              });
                            } else {
                              setUpFileLayout(entry);
                            }
                          }}
                        >
                          {signedIn ? (
                            <Check className="size-4" aria-hidden />
                          ) : (
                            <Link2 className="size-4" aria-hidden />
                          )}
                          {label}
                        </Button>
                      </li>
                    );
                  })}
              </ul>
            </FormSection>
          </div>
        )}
      </div>
    </div>
  );
}
