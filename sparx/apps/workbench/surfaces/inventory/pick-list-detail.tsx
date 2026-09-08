'use client';

// ONE WALK, at a desk.
//
// The supervisor's view of a walk: who has it, what is on it, what came up
// short. The person actually WALKING it uses `pick-guided.tsx`, which is one
// instruction at a time and built for a phone — this is the whole route laid
// out, which is what somebody planning the morning needs and exactly what
// somebody in an aisle does not.
//
// ── The shelf is the heading, not the product ─────────────────────────────
//
// Lines are grouped by shelf, in walk order, because that is the shape of the
// job: you go to A-01-03 once and take three things off it. A list sorted by
// product would send the picker back to the same shelf three times, and the
// route was computed precisely so it does not have to.
//
// ── A short line is loud ──────────────────────────────────────────────────
//
// Danger color, the reason spelled out, and a link to the count it raised. A
// short pick is the single best free signal that a stock number is wrong, and it
// is worth nothing if it is a grey row somebody scrolls past.

import { useState, type ReactNode } from 'react';
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Table,
  Text,
  Timestamp,
  Tooltip,
} from '@wizeworks/silicaui-react';
import {
  Ban,
  ClipboardCheck,
  Package,
  Printer,
  Route,
  ScanLine,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { plural } from './data';
import {
  pickErrorMessage,
  pickKindLabel,
  pickLineState,
  pickListState,
  shortReasonLabel,
  strategyLabel,
  useAssignPickList,
  useCancelPickList,
  usePickList,
  type PickLine,
} from './picking-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

/** Consecutive lines on the same shelf, in walk order. The shape of the job. */
function groupByShelf(lines: PickLine[]): { key: string; label: string; lines: PickLine[] }[] {
  const groups: { key: string; label: string; lines: PickLine[] }[] = [];
  for (const line of lines) {
    const key = line.binId ?? 'no-shelf';
    const last = groups[groups.length - 1];
    if (last?.key === key) {
      last.lines.push(line);
      continue;
    }
    groups.push({
      key,
      label: line.binCode ?? 'Anywhere in this location',
      lines: [line],
    });
  }
  return groups;
}

export function PickListDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';
  const { data: walk, isLoading, isFetching, dataUpdatedAt, isError, refetch } = usePickList(id);

  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState<string | null>(null);

  const assign = useAssignPickList(id);
  const cancel = useCancelPickList(id);
  const confirm = useConfirm();

  if (isError) {
    return (
      <div className={PANE_SHELL}>
        <EmptyState
          icon={<Route className="size-6" aria-hidden />}
          title="Could not open that walk"
          description="It may have been abandoned, or the server could not be reached."
        />
      </div>
    );
  }

  if (isLoading || !walk) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading the walk…
        </p>
      </div>
    );
  }

  const state = pickListState(walk.status);
  const open = walk.status !== 'picked' && walk.status !== 'cancelled';
  const groups = groupByShelf(walk.lines);
  const shorts = walk.lines.filter((l) => l.status === 'short');

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Walk actions"
        status={<span className="font-mono text-sm">{walk.number}</span>}
        controls={
          <>
            <Badge color={state.tone} variant="soft">
              {state.label}
            </Badge>
            {open ? (
              <Button
                size="sm"
                color="module-inventory"
                onClick={(event) => {
                  ctx.open(
                    'inventory.picking.guided',
                    { id: walk.id },
                    { target: targetFor(event) }
                  );
                }}
              >
                <ScanLine className="size-4" aria-hidden />
                <span className="hidden @md:inline">Work this walk</span>
              </Button>
            ) : null}
            <Tooltip content="Print the walk as a scannable sheet">
              <Button
                size="sm"
                variant="outline"
                aria-label="Print the walk sheet"
                onClick={(event) => {
                  ctx.open(
                    'inventory.documents.label',
                    {
                      number: walk.number,
                      title: 'Pick list',
                      subtitle: `${walk.warehouseName} · ${plural(walk.lineCount, 'line', 'lines')}`,
                    },
                    { target: targetFor(event) }
                  );
                }}
              >
                <Printer className="size-4" aria-hidden />
              </Button>
            </Tooltip>
            {open ? (
              <Tooltip content="Abandon this walk">
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  aria-label="Abandon this walk"
                  disabled={cancel.isPending}
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: `Abandon walk ${walk.number}?`,
                        description:
                          'Anything already picked stays picked — it is in a tote. The rest of the route is dropped and those orders can be put on a new walk.',
                        confirmLabel: 'Abandon it',
                        cancelLabel: 'Keep it',
                        color: 'danger',
                      });
                      if (!ok) return;
                      try {
                        await cancel.mutateAsync(undefined);
                      } catch (err) {
                        setError(pickErrorMessage(err, 'Could not abandon the walk.'));
                      }
                    })();
                  }}
                >
                  <Ban className="size-4" aria-hidden />
                </Button>
              </Tooltip>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={dataUpdatedAt}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {error ? (
          <Alert color="danger" variant="soft">
            <AlertContent>
              <AlertTitle>{error}</AlertTitle>
            </AlertContent>
          </Alert>
        ) : null}

        {shorts.length > 0 ? (
          <Alert color="danger" variant="soft">
            <AlertContent>
              <AlertTitle>
                {plural(shorts.length, 'line', 'lines')} could not be found on the shelf
              </AlertTitle>
              <AlertDescription>
                Those units have gone back into stock and are held for their orders, so nobody else
                can buy them. Each shelf has been put on a blind count — settle those and the
                numbers come right.
              </AlertDescription>
              {shorts[0]?.shortCountId ? (
                <AlertActions>
                  <Button
                    size="sm"
                    color="danger"
                    onClick={(event) => {
                      ctx.open(
                        'inventory.counts.detail',
                        { id: shorts[0]?.shortCountId ?? '' },
                        { target: targetFor(event) }
                      );
                    }}
                  >
                    <ClipboardCheck className="size-4" aria-hidden />
                    Open the count
                  </Button>
                </AlertActions>
              ) : null}
            </AlertContent>
          </Alert>
        ) : null}

        {/* What this walk IS. Facts, not a form. */}
        <Card>
          <div className="grid gap-4 p-4 @lg:grid-cols-3">
            <Fact label="Location" value={walk.warehouseName} />
            <Fact label="Shape" value={pickKindLabel(walk.kind)} />
            <Fact label="Route" value={strategyLabel(walk.strategy)} />
            <Fact label="Orders" value={walk.orders.map((o) => o.orderNumber).join(', ') || '—'} />
            <Fact
              label="Progress"
              value={`${String(walk.unitsPicked)} of ${String(walk.unitsRequested)} units`}
            />
            <Fact
              label="Started"
              value={
                walk.startedAt ? <Timestamp value={walk.startedAt} format="relative" /> : 'Not yet'
              }
            />
          </div>
        </Card>

        {/* Who has it. An input rather than a picker because a floor login is
            often not a sparx account, and refusing an unlinked name would mean
            the throughput report simply has no rows for half a shift. */}
        {open ? (
          <Card>
            <div className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-48 flex-1">
                <Text className="mb-1 text-sm">Who is walking it</Text>
                <Input
                  size="sm"
                  placeholder={walk.assignedTo ?? 'Nobody yet'}
                  value={assignee}
                  onChange={(event) => {
                    setAssignee(event.target.value);
                  }}
                />
              </div>
              <Button
                size="sm"
                color="module-inventory"
                variant="outline"
                disabled={assign.isPending || assignee.trim() === ''}
                onClick={() => {
                  void (async () => {
                    try {
                      await assign.mutateAsync(assignee.trim());
                      setAssignee('');
                    } catch (err) {
                      setError(pickErrorMessage(err, 'Could not assign the walk.'));
                    }
                  })();
                }}
              >
                <UserRound className="size-4" aria-hidden />
                Assign
              </Button>
              {walk.assignedTo ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={assign.isPending}
                  onClick={() => {
                    void assign.mutateAsync(null);
                  }}
                >
                  Hand back to the pool
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}

        {/* The route. */}
        {groups.map((group) => (
          <Card key={group.key}>
            <div className="border-base-300 flex items-center gap-2 border-b p-3">
              <Package className="size-4" aria-hidden />
              <span className="font-mono font-semibold">{group.label}</span>
              <span className="text-sm">{plural(group.lines.length, 'item', 'items')}</span>
            </div>
            <Table size="sm">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right whitespace-nowrap">Take</th>
                  <th className="hidden @lg:table-cell">For</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {group.lines.map((line) => {
                  const lineState = pickLineState(line.status);
                  return (
                    <tr key={line.id}>
                      <td className="w-full max-w-0">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{line.productTitle}</span>
                          <span className="truncate font-mono text-sm">{line.sku}</span>
                          {line.lotNumber ? (
                            <span className="truncate text-sm">
                              Batch {line.lotNumber}
                              {line.lotExpiresAt ? (
                                <>
                                  {' · expires '}
                                  <Timestamp value={line.lotExpiresAt} format="relative" />
                                </>
                              ) : null}
                            </span>
                          ) : null}
                          {line.status === 'short' ? (
                            <span className="truncate text-sm">
                              {shortReasonLabel(line.shortReason)}
                              {line.shortNote ? ` — ${line.shortNote}` : ''}
                            </span>
                          ) : null}
                          <span className="truncate text-sm @lg:hidden">
                            For {line.orderNumber}
                          </span>
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap tabular-nums">
                        {line.pickedQuantity > 0 && line.pickedQuantity < line.quantity
                          ? `${String(line.pickedQuantity)}/${String(line.quantity)}`
                          : line.quantity}
                      </td>
                      <td className="hidden whitespace-nowrap @lg:table-cell">
                        {line.orderNumber}
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <Badge color={lineState.tone} variant="soft" size="sm">
                            {line.status === 'short' ? (
                              <TriangleAlert className="size-3" aria-hidden />
                            ) : null}
                            {lineState.label}
                          </Badge>
                          {line.verifiedByScan ? (
                            <Tooltip content="Confirmed by a scan, not a tap">
                              <Badge color="success" variant="outline" size="sm">
                                <ScanLine className="size-3" aria-hidden />
                              </Badge>
                            </Tooltip>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        ))}

        {/* Once the walk is done, the next thing anybody wants is a box. */}
        {walk.status === 'picked' ? (
          <Alert color="success" variant="soft">
            <AlertContent>
              <AlertTitle>Picked — ready to pack</AlertTitle>
              <AlertDescription>
                Open a box for each order and scan the items into it. Anything that does not belong
                will be refused before it reaches the customer.
              </AlertDescription>
              <AlertActions>
                {walk.orders.map((order) => (
                  <Button
                    key={order.orderId}
                    size="sm"
                    color="success"
                    variant="outline"
                    onClick={(event) => {
                      ctx.open(
                        'inventory.packing.bench',
                        { orderId: order.orderId, pickListId: walk.id },
                        { target: targetFor(event) }
                      );
                    }}
                  >
                    <Package className="size-4" aria-hidden />
                    Pack {order.orderNumber}
                  </Button>
                ))}
              </AlertActions>
            </AlertContent>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="flex flex-col">
      <Text className="text-sm">{label}</Text>
      <span className="font-medium">{value}</span>
    </span>
  );
}
