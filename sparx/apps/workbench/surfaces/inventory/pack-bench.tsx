'use client';

// THE PACK BENCH — putting an order in a box, and being sure it is the right
// order in the right box.
//
// ── Verification is a refusal ─────────────────────────────────────────────
//
// Scan something the order does not contain and it is rejected, loudly, before
// it goes in. That is the entire product: a bench that warns and lets you
// continue has replaced a control with a notification, and the wrong item still
// reaches the customer.
//
// ── The screen is the box, not the order ──────────────────────────────────
//
// The big list is WHAT IS IN THIS BOX. What the order still owes lives
// underneath, because on the fourth box of a big order the packer's question is
// "is this one finished", not "what did they buy". Splitting an order across
// boxes is normal and the screen assumes it rather than treating it as an
// exception.
//
// ── Sealing and shipping are one button and two facts ─────────────────────
//
// "Seal and hand to shipping" is what a bench actually does, so it is one press.
// But a box that does not complete the order is refused until somebody says the
// partial shipment is deliberate, and the refusal names exactly what is missing.

import { useEffect, useState } from 'react';
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
  Tooltip,
} from '@wizeworks/silicaui-react';
import { Box, Package, PackageCheck, Plus, Printer, ScanLine, Truck } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { plural } from './data';
import { ScanInput, playScanFeedback } from './scan-input';
import {
  formatWeight,
  openPackingSlip,
  packageState,
  pickErrorMessage,
  useClosePackage,
  useCreatePackage,
  useFulfillPackage,
  usePackItem,
  usePackage,
  usePackages,
  useScanToPack,
  type PackageDetail,
} from './picking-data';

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function PackBenchSurface({ ctx }: { ctx: SurfaceContext }) {
  const orderId = typeof ctx.params.orderId === 'string' ? ctx.params.orderId : '';
  const pickListId = typeof ctx.params.pickListId === 'string' ? ctx.params.pickListId : '';
  const paramPackageId = typeof ctx.params.packageId === 'string' ? ctx.params.packageId : '';

  const [activeId, setActiveId] = useState(paramPackageId);
  const [error, setError] = useState<string | null>(null);

  const boxes = usePackages({ ...(orderId ? { orderId } : {}), take: 50 });
  const create = useCreatePackage();

  // The box to work in: the one that was asked for, else the open one, else
  // nothing yet. Resolved in an effect rather than during render because it
  // depends on a list that arrives after the first paint.
  const openBox = (boxes.data?.items ?? []).find((b) => b.status === 'open') ?? null;
  useEffect(() => {
    if (activeId) return;
    if (openBox) setActiveId(openBox.id);
  }, [activeId, openBox]);

  if (!orderId && !paramPackageId) {
    return (
      <div className={PANE_SHELL}>
        <EmptyState
          icon={<Box className="size-6" aria-hidden />}
          title="Pick an order to pack"
          description="Open the pack bench from a finished walk or from an order, and it knows what is meant to be in the box."
        />
      </div>
    );
  }

  const sealed = (boxes.data?.items ?? []).filter((b) => b.status === 'packed');

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Pack bench controls"
        status={
          <span className="text-sm">
            {plural(
              (boxes.data?.items ?? []).filter((b) => b.status !== 'cancelled').length,
              'box',
              'boxes'
            )}
          </span>
        }
        primary={
          <Button
            size="sm"
            color="module-inventory"
            variant="outline"
            className="ml-auto"
            disabled={create.isPending || !orderId}
            onClick={() => {
              void (async () => {
                try {
                  const box = await create.mutateAsync({
                    orderId,
                    ...(pickListId ? { pickListId } : {}),
                  });
                  setActiveId(box.id);
                  setError(null);
                } catch (err) {
                  setError(pickErrorMessage(err, 'Could not start another box.'));
                }
              })();
            }}
          >
            <Plus className="size-4" aria-hidden />
            <span className="hidden @md:inline">Another box</span>
          </Button>
        }
        controls={
          <>
            <PackageCheck className="size-4" aria-hidden />
          </>
        }
        refresh={
          <RefreshButton
            isFetching={boxes.isFetching}
            updatedAt={boxes.data ? boxes.dataUpdatedAt : undefined}
            onRefresh={() => {
              void boxes.refetch();
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

        {activeId ? (
          <ActiveBox packageId={activeId} ctx={ctx} />
        ) : (
          <Alert color="info">
            <AlertContent>
              <AlertTitle>No box open yet</AlertTitle>
              <AlertDescription>
                Start one, then scan each item into it. Anything that is not on this order will be
                refused.
              </AlertDescription>
              <AlertActions>
                <Button
                  color="module-inventory"
                  disabled={create.isPending}
                  onClick={() => {
                    void (async () => {
                      const box = await create.mutateAsync({
                        orderId,
                        ...(pickListId ? { pickListId } : {}),
                      });
                      setActiveId(box.id);
                    })();
                  }}
                >
                  <Box className="size-4" aria-hidden />
                  Start a box
                </Button>
              </AlertActions>
            </AlertContent>
          </Alert>
        )}

        {/* Boxes already sealed on this order. Small, because they are done —
            but present, because "did I already pack that" is asked constantly. */}
        {sealed.length > 0 ? (
          <Card>
            <div className="border-base-300 flex items-center gap-2 border-b p-3">
              <Truck className="size-4" aria-hidden />
              <span className="font-medium">{plural(sealed.length, 'box', 'boxes')} sealed</span>
            </div>
            <Table size="sm">
              <tbody>
                {sealed.map((box) => (
                  <tr key={box.id}>
                    <td className="w-full max-w-0">
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-mono">{box.number}</span>
                        <span className="truncate text-sm">
                          {plural(box.unitCount, 'unit', 'units')} · {formatWeight(box.weightGrams)}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      {box.fulfillmentId ? (
                        <Badge color="success" variant="soft" size="sm">
                          With shipping
                        </Badge>
                      ) : (
                        <Badge color="warning" variant="soft" size="sm">
                          Not handed over
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <Tooltip content="Print the packing slip">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Print the packing slip for ${box.number}`}
                          onClick={() => {
                            void openPackingSlip(box.id);
                          }}
                        >
                          <Printer className="size-4" aria-hidden />
                        </Button>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/* ── The open box ───────────────────────────────────────────────────────── */

function ActiveBox({ packageId, ctx }: { packageId: string; ctx: SurfaceContext }) {
  const { data: box, isLoading } = usePackage(packageId);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [weight, setWeight] = useState('');

  const scan = useScanToPack(packageId);
  const packItem = usePackItem(packageId);
  const close = useClosePackage(packageId);
  const fulfill = useFulfillPackage(packageId);
  const confirm = useConfirm();

  if (isLoading || !box) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading the box…
      </p>
    );
  }

  const state = packageState(box.status);
  const say = (text: string, next: 'success' | 'warning' | 'danger') => {
    setMessage(text);
    setTone(next);
  };

  const onScan = async (value: string) => {
    try {
      const result = await scan.mutateAsync({ value });
      playScanFeedback(result.outcome);
      say(result.message, result.outcome === 'applied' ? 'success' : 'warning');
    } catch (err) {
      playScanFeedback('rejected');
      say(pickErrorMessage(err, 'That scan could not be sent. Scan it again.'), 'danger');
    }
  };

  const sealAndShip = () => {
    void (async () => {
      const partial = !box.orderFullyPacked;
      if (partial) {
        const ok = await confirm({
          title: 'Send this as a partial shipment?',
          description: `The order still needs ${box.outstanding
            .map((o) => `${String(o.remaining)} × ${o.sku}`)
            .join(
              ', '
            )}. Those can go in another box later; the customer will see what is still to come on the packing slip.`,
          confirmLabel: 'Send it anyway',
          cancelLabel: 'Keep packing',
          color: 'warning',
        });
        if (!ok) return;
      }
      try {
        await fulfill.mutateAsync({
          close: true,
          ...(partial ? { allowPartial: true } : {}),
        });
        say('Sealed and handed to shipping.', 'success');
      } catch (err) {
        say(pickErrorMessage(err, 'Could not hand the box to shipping.'), 'danger');
      }
    })();
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="border-base-300 flex flex-wrap items-center gap-3 border-b p-3">
          <Package className="size-4" aria-hidden />
          <span className="font-mono font-semibold">{box.number}</span>
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
          <span className="text-sm">for {box.orderNumber}</span>
          {box.scannedCount > 0 && box.scannedCount === box.unitCount ? (
            <Badge color="success" variant="soft" size="sm">
              <ScanLine className="size-3" aria-hidden />
              Every unit scanned
            </Badge>
          ) : null}
        </div>

        {box.status === 'open' ? (
          <div className="p-4">
            <ScanInput onScan={onScan} placeholder="Scan an item" busy={scan.isPending} large />
          </div>
        ) : null}
      </Card>

      {message ? (
        <Alert color={tone} variant="soft">
          <AlertContent>
            <AlertTitle>{message}</AlertTitle>
          </AlertContent>
        </Alert>
      ) : null}

      {/* What is in it. */}
      <Card>
        <div className="border-base-300 border-b p-3">
          <span className="font-medium">In this box</span>
        </div>
        {box.lines.length === 0 ? (
          <EmptyState
            icon={<Box className="size-6" aria-hidden />}
            title="Empty so far"
            description="Scan the first item, or type a quantity against a line below."
          />
        ) : (
          <Table size="sm">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right whitespace-nowrap">In box</th>
                <th className="hidden text-right whitespace-nowrap @lg:table-cell">Scanned</th>
              </tr>
            </thead>
            <tbody>
              {box.lines.map((line) => (
                <tr key={line.id}>
                  <td className="w-full max-w-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{line.name}</span>
                      <span className="truncate font-mono text-sm">{line.sku}</span>
                    </span>
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums">
                    {box.status === 'open' ? (
                      <Input
                        size="sm"
                        type="number"
                        min={0}
                        max={line.ordered - line.packedElsewhere}
                        className="w-20 text-right"
                        aria-label={`How many ${line.sku} in this box`}
                        defaultValue={String(line.quantity)}
                        onBlur={(event) => {
                          const next = Number(event.target.value);
                          if (Number.isNaN(next) || next === line.quantity) return;
                          void (async () => {
                            try {
                              await packItem.mutateAsync({
                                orderItemId: line.orderItemId,
                                quantity: next,
                              });
                            } catch (err) {
                              say(pickErrorMessage(err, 'Could not change that line.'), 'danger');
                            }
                          })();
                        }}
                      />
                    ) : (
                      line.quantity
                    )}
                  </td>
                  <td className="hidden text-right whitespace-nowrap @lg:table-cell">
                    {line.scannedQuantity >= line.quantity ? (
                      <Badge color="success" variant="soft" size="sm">
                        <ScanLine className="size-3" aria-hidden />
                        {line.scannedQuantity}
                      </Badge>
                    ) : (
                      <Badge color="warning" variant="soft" size="sm">
                        {line.scannedQuantity} of {line.quantity}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* What the order still owes. Underneath, because on box four the question
          is "is this one finished", not "what did they buy". */}
      {box.outstanding.length > 0 ? (
        <Card>
          <div className="border-base-300 border-b p-3">
            <span className="font-medium">Still to pack</span>
          </div>
          <Table size="sm">
            <tbody>
              {box.outstanding.map((line) => (
                <tr key={line.orderItemId}>
                  <td className="w-full max-w-0">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{line.name}</span>
                      <span className="truncate font-mono text-sm">{line.sku}</span>
                    </span>
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums">{line.remaining}</td>
                  {box.status === 'open' ? (
                    <td className="whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void packItem.mutateAsync({
                            orderItemId: line.orderItemId,
                            quantity: line.remaining,
                          });
                        }}
                      >
                        Add all
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {box.status === 'open' ? (
        <Card>
          <div className="flex flex-wrap items-end gap-3 p-4">
            <div className="w-40">
              <Text className="mb-1 text-sm">Weight in grams</Text>
              <Input
                size="sm"
                type="number"
                min={0}
                placeholder={box.weightGrams === null ? 'Optional' : String(box.weightGrams)}
                value={weight}
                onChange={(event) => {
                  setWeight(event.target.value);
                }}
              />
            </div>

            <Button
              color="module-inventory"
              disabled={close.isPending || fulfill.isPending || box.unitCount === 0}
              onClick={sealAndShip}
            >
              <Truck className="size-4" aria-hidden />
              Seal and hand to shipping
            </Button>

            <Button
              variant="outline"
              disabled={close.isPending || box.unitCount === 0}
              onClick={() => {
                void (async () => {
                  try {
                    await close.mutateAsync({
                      ...(weight.trim() ? { weightGrams: Number(weight) } : {}),
                      ...(box.orderFullyPacked ? {} : { allowPartial: true }),
                    });
                    say('Sealed. It has not been handed to shipping yet.', 'success');
                  } catch (err) {
                    say(pickErrorMessage(err, 'Could not seal the box.'), 'danger');
                  }
                })();
              }}
            >
              Seal only
            </Button>
          </div>
        </Card>
      ) : (
        <SealedActions box={box} ctx={ctx} onSay={say} />
      )}
    </div>
  );
}

function SealedActions({
  box,
  ctx,
  onSay,
}: {
  box: PackageDetail;
  ctx: SurfaceContext;
  onSay: (text: string, tone: 'success' | 'warning' | 'danger') => void;
}) {
  const fulfill = useFulfillPackage(box.id);

  return (
    <Alert color={box.fulfillmentId ? 'success' : 'warning'} variant="soft">
      <AlertContent>
        <AlertTitle>
          {box.fulfillmentId
            ? `${box.number} is with shipping`
            : `${box.number} is sealed but not handed over`}
        </AlertTitle>
        <AlertDescription>
          {plural(box.unitCount, 'unit', 'units')}
          {box.weightGrams ? `, ${formatWeight(box.weightGrams)}` : ''}
          {box.fulfillmentId
            ? '. Buy a label from the order when you are ready.'
            : '. Nothing has been told to ship it yet.'}
        </AlertDescription>
        <AlertActions>
          {box.fulfillmentId ? null : (
            <Button
              size="sm"
              color="warning"
              disabled={fulfill.isPending}
              onClick={() => {
                void (async () => {
                  try {
                    await fulfill.mutateAsync({});
                    onSay('Handed to shipping.', 'success');
                  } catch (err) {
                    onSay(pickErrorMessage(err, 'Could not hand it over.'), 'danger');
                  }
                })();
              }}
            >
              <Truck className="size-4" aria-hidden />
              Hand to shipping
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void openPackingSlip(box.id);
            }}
          >
            <Printer className="size-4" aria-hidden />
            Packing slip
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => {
              ctx.open('commerce.order.detail', { id: box.orderId }, { target: targetFor(event) });
            }}
          >
            Open {box.orderNumber}
          </Button>
        </AlertActions>
      </AlertContent>
    </Alert>
  );
}
