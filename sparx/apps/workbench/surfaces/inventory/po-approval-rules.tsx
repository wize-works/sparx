'use client';

// SPENDING LIMITS — when an order needs a second pair of eyes.
//
// The mirror of the limits on the way IN (a customer's order held until staff
// agree to sell). These hold YOUR order until somebody senior agrees to spend.
//
// ── Why the list is sorted the way it is ──────────────────────────────────
//
// By threshold, descending — which is the order the rules are actually APPLIED
// in. When two rules both match an order they can disagree about who signs, and
// the strictest threshold the order clears is the one that wins: a £20,000 order
// routes to the £10,000 approver, not the £500 one. Sorting the list any other
// way (alphabetically, by age) would show a precedence that is not the real one.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Table,
  Text,
} from '@wizeworks/silicaui-react';
import { PlusCircle, ShieldCheck } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { formatCents } from './data';
import { approverLabel, ruleScopeLabel, usePoApprovalRules } from './po-approvals-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function PoApprovalRulesSurface({ ctx }: { ctx: SurfaceContext }) {
  const rules = usePoApprovalRules(true);
  const rows = rules.data?.items ?? [];

  const open = (id: string, event: { shiftKey: boolean; altKey: boolean }) => {
    ctx.open(
      'inventory.purchase-orders.approval-rules.detail',
      { id },
      { target: targetFor(event) }
    );
  };

  const body = () => {
    if (rules.isError) {
      return (
        <EmptyState
          icon={<ShieldCheck className="size-6" aria-hidden />}
          title="Could not load your spending limits"
          description="This is a problem reaching the server, not a statement that you have none. Try again in a moment."
        />
      );
    }
    if (rules.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Loading your spending limits…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<ShieldCheck className="size-6" aria-hidden />}
          title="No spending limits set"
          description="Every purchase order goes straight to the supplier the moment somebody sends it. Set a limit and orders over it wait for a named person to approve them first — the usual reason is a business where more than one person can buy."
          actions={
            <Button
              color="module"
              onClick={() => {
                ctx.open('inventory.purchase-orders.approval-rules.detail', { id: 'new' });
              }}
            >
              <PlusCircle className="size-4" aria-hidden />
              Set a limit
            </Button>
          }
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Limit</th>
            <th className="text-right whitespace-nowrap">Over</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Signed off by</th>
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
                  <span className="truncate">{row.name}</span>
                  <span className="truncate text-sm">{ruleScopeLabel(row)}</span>
                </span>
              </td>
              <td className="text-right whitespace-nowrap tabular-nums">
                {row.minAmountCents === 0 ? 'Every order' : formatCents(row.minAmountCents)}
              </td>
              <td className="hidden whitespace-nowrap @lg:table-cell">{approverLabel(row)}</td>
              <td className="whitespace-nowrap">
                <Badge color={row.isActive ? 'success' : 'neutral'} variant="soft" size="sm">
                  {row.isActive ? 'In force' : 'Switched off'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Spending limit controls"
        primary={
          <Button
            className="ml-auto"
            size="sm"
            color="module"
            onClick={() => {
              ctx.open('inventory.purchase-orders.approval-rules.detail', { id: 'new' });
            }}
          >
            <PlusCircle className="size-4" aria-hidden />
            New limit
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={rules.isFetching}
            updatedAt={rules.data ? rules.dataUpdatedAt : undefined}
            onRefresh={() => {
              void rules.refetch();
            }}
          />
        }
      />

      {rows.length > 1 ? (
        <Alert color="info">
          <AlertContent>
            <AlertTitle>When two limits both apply</AlertTitle>
            <AlertDescription>
              The strictest one the order clears wins, so an order over your highest limit goes to
              that approver rather than to the person named on a smaller one. The list is in that
              order, top first.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>

      <Text className="text-sm">
        Orders waiting on a limit appear under Sign-offs. Nothing is ordered while an order waits.
      </Text>
    </div>
  );
}
