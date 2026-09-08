'use client';

// WHAT YOU OWE FOR CONSIGNED STOCK — and who you are behind with.
//
// Consigned goods belong to the supplier until they sell. That moment creates a
// debt, and until somebody adds those moments up over a period and sends the
// total, the supplier is financing the business by accident. Every consignment
// arrangement that goes wrong goes wrong here, not at the receiving door.
//
// ── Two lists, and the top one is the point ───────────────────────────────
//
// The settlements list answers "what have I sent". The UNSETTLED list answers
// "what have I not" — which is the question a merchant actually has, and the one
// a screen showing only documents cannot answer at all. It is deliberately
// first.
//
// ── Unpriced units are counted, never valued at nothing ───────────────────
//
// A consigned sale with no recorded cost is money owed that nobody can currently
// put a number on. It is shown as a count, and it BLOCKS closing a period: a
// settlement that quietly treats those units as free pays the owner short, and
// the difference is found — if it is ever found — by them.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  EmptyState,
  NativeSelect,
  Table,
  Text,
  Timestamp,
} from '@wizeworks/silicaui-react';
import { Handshake, ReceiptText } from 'lucide-react';
import { useState } from 'react';
import { FormSection } from '../../components/form-section';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents, plural } from './data';
import { settlementTone, useConsignmentSettlements, useUnsettledConsignment } from './demand-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function ConsignmentSettlementsSurface({ ctx }: { ctx: SurfaceContext }) {
  const [status, setStatus] = useState('');
  const list = useConsignmentSettlements(status ? { status } : {});
  const unsettled = useUnsettledConsignment();

  const rows = list.data?.items ?? [];
  const owedCents = list.data?.owedCents ?? 0;
  const behind = (unsettled.data?.items ?? []).filter(
    (o) => o.amountCents > 0 || o.unpricedUnits > 0
  );
  const unpricedTotal = behind.reduce((sum, o) => sum + o.unpricedUnits, 0);

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open('inventory.consignment.detail', { id }, { target: targetFor(event) });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Consignment controls"
        status={
          <Text className="text-sm">
            {owedCents > 0
              ? `${formatCents(owedCents)} owed on closed periods`
              : 'Nothing outstanding'}
          </Text>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-44 shrink"
              aria-label="Which settlements"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
              }}
            >
              <option value="">All periods</option>
              <option value="draft">Drafts</option>
              <option value="closed">Closed, unbilled</option>
              <option value="invoiced">Billed</option>
              <option value="paid">Paid</option>
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={list.isFetching || unsettled.isFetching}
            updatedAt={list.data ? list.dataUpdatedAt : undefined}
            onRefresh={() => {
              void list.refetch();
              void unsettled.refetch();
            }}
          />
        }
      />

      {unpricedTotal > 0 ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>
              {plural(unpricedTotal, 'unit', 'units')} sold with no cost recorded
            </AlertTitle>
            <AlertDescription>
              They are counted below and left out of the money, because a line reading nothing would
              say the owner gave them to you. A period containing them cannot be closed — put a cost
              on those items and rebuild the draft.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        {/* ── What has not been settled ────────────────────────────────── */}
        <FormSection className="bg-module bg-soft" title="Not yet settled">
          <div className="p-0">
            {unsettled.isLoading ? (
              <p className="p-4 text-base" role="status">
                Working out what is owed…
              </p>
            ) : behind.length === 0 ? (
              <EmptyState
                icon={<Handshake className="size-6" aria-hidden />}
                title="Nothing is outstanding"
                description="Either you hold no consigned stock, or every sale from it has already been settled with its owner."
              />
            ) : (
              <Table size="sm">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th className="hidden whitespace-nowrap @lg:table-cell">Settled through</th>
                    <th className="text-right whitespace-nowrap">Units sold</th>
                    <th className="text-right whitespace-nowrap">Owed</th>
                  </tr>
                </thead>
                <tbody>
                  {behind.map((owner) => (
                    <tr key={owner.ownerId}>
                      <td className="w-full max-w-0">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{owner.ownerName ?? 'Unnamed owner'}</span>
                          {owner.earliestUnsettledSaleAt ? (
                            <span className="truncate text-sm">
                              Oldest unsettled sale{' '}
                              <Timestamp value={owner.earliestUnsettledSaleAt} format="relative" />
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="hidden whitespace-nowrap @lg:table-cell">
                        {/* Null is its own sentence: a brand-new arrangement has
                            never been settled, which is different from being up
                            to date. */}
                        {owner.settledThrough ? (
                          <Timestamp value={owner.settledThrough} format="absolute" />
                        ) : (
                          <Badge color="info" variant="soft" size="sm">
                            Never settled
                          </Badge>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap tabular-nums">
                        {owner.unitsSold}
                        {owner.unpricedUnits > 0 ? (
                          <span className="text-sm"> · {owner.unpricedUnits} unpriced</span>
                        ) : null}
                      </td>
                      <td className="text-right tabular-nums">{formatCents(owner.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </FormSection>

        {/* ── The documents ────────────────────────────────────────────── */}
        <FormSection title="Settlement periods">
          <div className="p-0">
            {list.isLoading ? (
              <p className="p-4 text-base" role="status">
                Loading settlements…
              </p>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<ReceiptText className="size-6" aria-hidden />}
                title="No settlement periods yet"
                description="A settlement closes a stretch of time against one owner: everything of theirs that sold, at the cost agreed when it arrived, with a document to pay against."
              />
            ) : (
              <Table size="sm" hover>
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Owner</th>
                    <th className="text-right whitespace-nowrap">Units</th>
                    <th className="text-right whitespace-nowrap">Amount</th>
                    <th className="whitespace-nowrap">State</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      role="button"
                      onClick={(event) => {
                        open(row.id, event);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        open(row.id, event);
                      }}
                    >
                      <td className="w-full max-w-0">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-mono">{row.number}</span>
                          <span className="truncate text-sm">
                            <Timestamp value={row.periodStart} format="absolute" /> →{' '}
                            <Timestamp value={row.periodEnd} format="absolute" />
                          </span>
                        </span>
                      </td>
                      <td className="max-w-[12rem] truncate">
                        {row.supplierName ?? row.customerName ?? 'Unnamed owner'}
                      </td>
                      <td className="text-right tabular-nums">{row.unitsSold}</td>
                      <td className="text-right tabular-nums">
                        {formatCents(row.totalCents, row.currency)}
                      </td>
                      <td className="whitespace-nowrap">
                        <Badge color={settlementTone(row.status)} variant="soft" size="sm">
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </FormSection>
      </div>
    </div>
  );
}
