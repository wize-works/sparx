'use client';

// WHAT YOUR STOCK COST YOU — the opening balance, filled in once.
//
// ── Why this screen exists ──────────────────────────────────────────────────
//
// Cost is optional and the product form never asks for it, so a business can
// run for months with every value-of-stock figure reading $0.00 — which is
// indistinguishable from a business that owns nothing, and is exactly what
// happened to a boutique holding 372 garments (issue 175).
//
// Asking on the product form would be the obvious fix and is the wrong one. A
// product is created at the moment of LEAST knowledge, often before the first
// delivery. Cost properly arrives WITH a delivery, which the platform already
// stamps per movement. What that leaves is the opening balance — the stock you
// already had on the day you started — and this is the list of exactly that.
//
// ── It is a typing job, so it is built like one ─────────────────────────────
//
// One column of boxes, ordered by how many units each holds, so somebody who
// fills in five rows and stops has still fixed most of the number. Enter moves
// down. Nothing saves until Save, and the toolbar says what is about to change,
// because this writes to every margin figure in the business.

import { useState } from 'react';
import { Button, Card, EmptyState, Table, Text, useToast } from '@wizeworks/silicaui-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { PaneWaiting } from '../../components/pane-waiting';
import { RefreshButton } from '../../components/refresh-button';
import { PaneLoadError } from '../../components/pane-load-error';
import { useDirtySource } from '../../lib/workbench/dirty';
import { formatCents, plural } from './data';
import { UncostedRow } from './uncosted-row';
import { costsErrorMessage, useSetCosts, useUncostedStock } from './uncosted-data';
import { entriesFrom, extendedTotal } from './uncosted-entries';
import { Coins, Wallet } from 'lucide-react';

const COLUMN = 'mx-auto flex w-full max-w-4xl flex-col gap-4';

function AllCosted() {
  return (
    <EmptyState
      icon={<Wallet className="size-6" aria-hidden />}
      title="Everything you hold has a cost"
      description="Every value-of-stock figure in the business is a real number. New stock takes its cost from the delivery it arrives on, so this stays empty unless you count something in by hand."
    />
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <PaneLoadError
      icon={<Coins className="size-6" aria-hidden />}
      title="Could not work out what is missing a cost"
      description="This is a problem reaching the server. Nothing about your stock or its costs has changed."
      onRetry={onRetry}
    />
  );
}

export function UncostedStockSurface() {
  const [typed, setTyped] = useState<Record<string, string>>({});
  const stock = useUncostedStock();
  const save = useSetCosts();
  const toast = useToast();

  const items = stock.data?.items ?? [];
  const entries = entriesFrom(items, typed);
  useDirtySource(entries.length > 0, 'You have typed costs that are not saved yet. Close anyway?');

  /** Enter moves down the column rather than submitting — this is a long typing
   *  job and the hands should never have to find the mouse. */
  const focusNext = (index: number) => {
    const boxes = document.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]');
    boxes[index + 1]?.focus();
  };

  const onSave = () => {
    if (entries.length === 0) return;
    save.mutate(entries, {
      onSuccess: (result) => {
        setTyped({});
        toast.add({
          title: `${plural(result.updated, 'cost', 'costs')} recorded`,
          description:
            result.skipped.length > 0
              ? `${plural(result.skipped.length, 'item', 'items')} already had a cost by the time this saved, so nothing there was overwritten.`
              : 'Your value-of-stock figures now count these.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not record those costs',
          description: costsErrorMessage(error, 'Nothing was saved. Try again in a moment.'),
          type: 'error',
        });
      },
    });
  };

  const body = () => {
    if (stock.isError)
      return (
        <LoadFailed
          onRetry={() => {
            void stock.refetch();
          }}
        />
      );
    if (stock.isPending) return <PaneWaiting label="Finding what has no cost…" />;
    if (items.length === 0) return <AllCosted />;

    return (
      <div className={COLUMN}>
        <Text>
          {plural(stock.data?.total ?? 0, 'thing', 'things')} on your shelves —{' '}
          {plural(stock.data?.uncostedUnits ?? 0, 'unit', 'units')} in all — have never had a cost
          recorded, so they count as nothing in every figure about what your stock is worth. Put in
          what one of each cost you and those figures become real. The biggest holdings are first,
          so filling in the top few fixes most of the number.
        </Text>

        <Card className="overflow-x-auto">
          <Table size="sm">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right whitespace-nowrap">You hold</th>
                <th className="hidden text-right whitespace-nowrap @lg:table-cell">Sells for</th>
                <th className="whitespace-nowrap">Cost to you</th>
                <th className="hidden text-right whitespace-nowrap @xl:table-cell">
                  Worth in total
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <UncostedRow
                  key={item.variantId}
                  item={item}
                  value={typed[item.variantId] ?? ''}
                  onValue={(next) => {
                    setTyped((current) => ({ ...current, [item.variantId]: next }));
                  }}
                  onEnter={() => {
                    focusNext(index);
                  }}
                />
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Stock cost controls"
        status={
          entries.length > 0 ? (
            <Text as="span" className="text-sm">
              {plural(entries.length, 'cost', 'costs')} typed · adds{' '}
              {formatCents(extendedTotal(items, typed))} to what your stock is worth
            </Text>
          ) : null
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            disabled={entries.length === 0 || save.isPending}
            loading={save.isPending}
            onClick={onSave}
          >
            <Coins className="size-4" aria-hidden />
            Save {entries.length > 0 ? plural(entries.length, 'cost', 'costs') : 'costs'}
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={stock.isFetching}
            updatedAt={stock.data ? stock.dataUpdatedAt : undefined}
            onRefresh={() => {
              void stock.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}
