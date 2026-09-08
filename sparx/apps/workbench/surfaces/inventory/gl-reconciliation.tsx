'use client';

// STOCK VERSUS YOUR BOOKS (docs/146 Phase 10.9).
//
// The question an accountant asks every year end and nobody can answer: your
// system says the stock is worth £182,400 and my inventory account says
// £176,905 — where is the £5,495?
//
// ── Why this can be answered at all ──────────────────────────────────────
//
// The gap is almost never an error. It is four or five ordinary timing
// differences a stock system knows about and a ledger does not: goods received
// and not yet invoiced, invoiced and not yet received, consigned stock in the
// building that is not an asset, units nobody costed, stock in transit between
// two of your own places. Naming them turns "find the £5,495" into a list of
// figures with an explanation each.
//
// ── The one number that must never be zero by accident ───────────────────
//
// sparx keeps no ledger, so the balance of THEIR inventory account is something
// it has to be told — typed off a trial balance, or pulled through an accounting
// connection. Until it is, the unexplained difference is NULL and this screen
// says so and asks for the figure. Reporting a zero difference against nothing
// would be the single most dangerous number in the module.

import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  DateInput,
  Field,
  FieldLabel,
  Heading,
  Input,
  Table,
  Text,
  Textarea,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { Scale } from 'lucide-react';
import { FormSection } from '../../components/form-section';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterCommit } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, stockErrorMessage } from './data';
import {
  useGlReconciliation,
  useGlSnapshots,
  useRecordGlSnapshot,
  type ReconciliationLine,
} from './reporting-data';

/** How each reconciling line reads. Color carries the direction — something
 *  that RAISES what the books should show against sparx, or lowers it — so the
 *  sign in the column has a word beside it rather than being read backwards
 *  half the time. */
function lineTone(line: ReconciliationLine): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (line.kind) {
    case 'sparx_value':
      return 'info';
    case 'ledger_value':
      return 'info';
    case 'unexplained':
      return line.amountCents === null ? 'neutral' : line.amountCents === 0 ? 'success' : 'danger';
    case 'uncosted_units':
      return line.amountCents === null ? 'warning' : 'neutral';
    default:
      return 'neutral';
  }
}

export function GlReconciliationSurface(_props: { ctx: SurfaceContext }) {
  const toast = useToast();
  const [asOf, setAsOf] = useState<Date | null>(() => new Date());
  const iso = asOf ? asOf.toISOString() : undefined;

  const report = useGlReconciliation(iso);
  const snapshots = useGlSnapshots();
  const record = useRecordGlSnapshot();

  const [accountName, setAccountName] = useState('');
  const [balance, setBalance] = useState('');
  const [note, setNote] = useState('');

  const data = report.data;
  const currency = data?.currency ?? 'USD';

  const saveBalance = (): void => {
    const parsed = Number(balance.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(parsed) || accountName.trim() === '') return;
    record.mutate(
      {
        as_of: (asOf ?? new Date()).toISOString(),
        account_name: accountName.trim(),
        balance_cents: Math.round(parsed * 100),
        currency,
        note: note.trim() === '' ? null : note.trim(),
      },
      {
        onSuccess: () => {
          setBalance('');
          setNote('');
          afterCommit(() => {
            toast.add({ title: 'Recorded', type: 'success' });
          });
        },
        onError: (error) => {
          afterCommit(() => {
            toast.add({
              title: 'Could not record it',
              description: stockErrorMessage(error, 'Nothing was saved.'),
              type: 'error',
            });
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Reconciliation controls"
        controls={
          <>
            <DateInput
              color="module"
              value={asOf}
              aria-label="Reconcile as at this date"
              onValueChange={(date) => {
                setAsOf(date);
              }}
            />
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={report.isFetching}
            updatedAt={report.data ? report.dataUpdatedAt : undefined}
            onRefresh={() => {
              void report.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Heading level={1} className="flex items-center gap-2 text-2xl font-semibold">
              <Scale className="size-5" aria-hidden />
              Stock versus your books
            </Heading>
            <Text>
              What sparx says your stock is worth, set against what your accounting system says,
              with every ordinary reason they differ named and priced.
            </Text>
          </div>

          {report.isError ? (
            <Alert color="warning">
              <AlertContent>
                <AlertTitle>Could not work that out just now</AlertTitle>
                <AlertDescription>
                  This is a problem reaching the server. Your stock and your figures are unaffected.
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : !data ? (
            <p className="p-4 text-sm" role="status">
              Working it out…
            </p>
          ) : (
            <>
              {data.awaitingLedgerFigure ? (
                <Alert color="info">
                  <AlertContent>
                    <AlertTitle>Tell sparx what your books say</AlertTitle>
                    <AlertDescription>
                      sparx does not keep your ledger, so it cannot know what your inventory account
                      holds. Enter the balance below — off your trial balance, or from whoever keeps
                      the books — and the difference gets worked out and explained. Until then there
                      is nothing to compare against, which is why the figure is blank rather than
                      zero.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              ) : data.unexplainedCents === 0 ? (
                <Alert color="success" variant="soft">
                  <AlertContent>
                    <AlertTitle>It reconciles</AlertTitle>
                    <AlertDescription>
                      Once the timing differences below are allowed for, sparx and your books agree
                      exactly. This is the answer you want when the accountant asks.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              ) : (
                <Alert color="warning">
                  <AlertContent>
                    <AlertTitle>
                      {formatCents(Math.abs(data.unexplainedCents ?? 0), currency)} is unexplained
                    </AlertTitle>
                    <AlertDescription>
                      Everything below is accounted for. What is left over is worth looking at — the
                      usual causes are a journal posted by hand, an opening balance that was never
                      matched, or stock written off in one system and not the other.
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              )}

              <FormSection
                title="Where the difference comes from"
                description={`As at ${new Date(data.asOf).toLocaleDateString()}. Each line either raises what your books should show against sparx, or lowers it.`}
              >
                <Table size="sm">
                  <thead>
                    <tr>
                      <th>What</th>
                      <th className="hidden @lg:table-cell">Covering</th>
                      <th className="text-right whitespace-nowrap">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line, index) => (
                      <tr key={`${line.kind}-${index}`}>
                        <td className="w-full max-w-0">
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate font-medium">
                              {line.kind === 'sparx_value'
                                ? 'What sparx says'
                                : line.kind === 'ledger_value'
                                  ? 'What your books say'
                                  : line.kind === 'unexplained'
                                    ? 'Unexplained'
                                    : line.description.split('—')[0]?.trim()}
                            </span>
                            <Text className="text-sm">{line.description}</Text>
                          </span>
                        </td>
                        <td className="hidden whitespace-nowrap @lg:table-cell">
                          <Text className="text-sm">{line.reference ?? '—'}</Text>
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {line.amountCents === null ? (
                            <Badge color={lineTone(line)} variant="soft" size="sm">
                              Not known
                            </Badge>
                          ) : (
                            <span
                              className={`font-medium tabular-nums ${
                                line.kind === 'unexplained' && line.amountCents !== 0
                                  ? 'text-danger'
                                  : ''
                              }`}
                            >
                              {line.amountCents < 0 ? '−' : ''}
                              {formatCents(Math.abs(line.amountCents), currency)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </FormSection>
            </>
          )}

          <FormSection
            title="What your books say"
            description="The balance of your inventory account, as your accounting system reports it. Recorded per date, so last year's reconciliation keeps saying what it said."
          >
            <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
              <Field>
                <FieldLabel>Account, as your books call it</FieldLabel>
                <Input
                  color="module"
                  value={accountName}
                  placeholder="1200 Stock"
                  onChange={(event) => {
                    setAccountName(event.target.value);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel>Balance</FieldLabel>
                <Input
                  color="module"
                  value={balance}
                  inputMode="decimal"
                  placeholder="176905.00"
                  onChange={(event) => {
                    setBalance(event.target.value);
                  }}
                />
                <Text className="text-sm">In {currency}. A negative figure is allowed.</Text>
              </Field>
            </div>

            <Field>
              <FieldLabel>Anything worth noting</FieldLabel>
              <Textarea
                color="module"
                rows={2}
                value={note}
                placeholder="Before the year-end adjustments"
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
            </Field>

            <div>
              <Button
                color="module"
                disabled={accountName.trim() === '' || balance.trim() === '' || record.isPending}
                onClick={saveBalance}
              >
                Record it
              </Button>
            </div>

            {(snapshots.data?.items.length ?? 0) > 0 ? (
              <Table size="sm">
                <thead>
                  <tr>
                    <th>As at</th>
                    <th>Account</th>
                    <th className="hidden @md:table-cell">Where it came from</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(snapshots.data?.items ?? []).map((snapshot) => (
                    <tr key={snapshot.id}>
                      <td className="whitespace-nowrap">
                        <Timestamp value={snapshot.asOf} format="absolute" />
                      </td>
                      <td className="max-w-40 truncate">{snapshot.accountName}</td>
                      <td className="hidden @md:table-cell">
                        <Badge
                          color={snapshot.source === 'manual' ? 'neutral' : 'success'}
                          variant="soft"
                          size="sm"
                        >
                          {snapshot.source === 'manual'
                            ? 'Typed in'
                            : snapshot.source === 'xero'
                              ? 'Read from Xero'
                              : 'Read from QuickBooks'}
                        </Badge>
                      </td>
                      <td className="text-right font-medium tabular-nums">
                        {formatCents(snapshot.balanceCents, snapshot.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : null}
          </FormSection>
        </div>
      </div>
    </div>
  );
}
