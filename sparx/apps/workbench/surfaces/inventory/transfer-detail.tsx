'use client';

// ONE TRANSFER — composing it, sending it, and booking it in.
//
// ── One pane, several states, not several panes ──────────────────────────
//
// Create and edit are the SAME surface. A brand-new transfer opens at
// {id:'new'} as an empty draft you compose; saving it turns it into {id} with a
// real reference, and the pane retargets itself. From there its life plays out
// in the same pane: a draft you can still change, an in-transit transfer you can
// receive or call off, a finished one you can only read. The header carries the
// status and the action that fits it — never a bespoke "Status" card in the body.
//
// ── What can change, and when ────────────────────────────────────────────
//
// The two locations are fixed the moment a transfer exists — the API has no way
// to move stock between a different pair after the fact — so they are choices
// only while composing a new one. After that, only the ITEMS on a draft can
// change, and only until it is sent. Everything is explicit-save: edits live in
// the pane until Save writes them, and closing with unsaved work asks first.
//
// ── The item picker is a modal onto the pane's own draft ─────────────────
//
// Adding an item searches the catalog, which is more than fits in a row. It
// commits to the pane's local draft, never straight to the server, so the pane
// stays dirty on its behalf and one Save persists the lot. Receiving is the
// other modal: an adjust-then-confirm for what actually turned up.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Text,
  Textarea,
  Timestamp,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  ArrowRight,
  Ban,
  Package,
  PackagePlus,
  PackageX,
  Pencil,
  Printer,
  Send,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { PaneScope } from '../../lib/dock/window-boundary';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useStockLocations, type StockLocation } from './data';
import {
  isNotFound,
  newDraftLineKey,
  plural,
  transferErrorMessage,
  transferState,
  transferStatusBlurb,
  usePickerProducts,
  usePickerVariants,
  useCancelTransfer,
  useDeleteTransfer,
  useDispatchTransfer,
  useReceiveTransfer,
  useSaveTransfer,
  useTransfer,
  warehouseLabel,
  type DraftLine,
  type ReceiveLine,
  type TransferDetail,
  type TransferLine,
} from './transfers-data';
import { ScanInput, playScanFeedback } from './scan-input';
import { useScanQueue, useScanToTransfer, type ScanActionResult } from './scan-data';
import { PaneLoadError } from '../../components/pane-load-error';

/**
 * Scan items onto a draft transfer.
 *
 * Each pull adds one to the line, creating it if the item is not on the transfer
 * yet — the same accumulating behaviour as counting, for the same reason: moving
 * a pallet is one trigger pull per box.
 */
function ScanIntoTransfer({ transferId }: { transferId: string }) {
  const scan = useScanToTransfer(transferId);
  const queue = useScanQueue();
  const [result, setResult] = useState<ScanActionResult | null>(null);

  return (
    <ScanInput
      onScan={async (value) => {
        const outcome = await scan.mutateAsync({ value });
        setResult(outcome);
        playScanFeedback(outcome.outcome);
      }}
      placeholder="Scan an item onto this transfer"
      result={result}
      busy={scan.isPending}
      queued={queue.size}
      focusOnMount={false}
    />
  );
}

/** Centred and capped — a pane torn onto a second monitor is 2000px wide, and
 *  uncapped this becomes a line of controls pinned to the left edge. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

function toDraftLine(line: TransferLine): DraftLine {
  return {
    key: newDraftLineKey(),
    id: line.id,
    variantId: line.variantId,
    variantSku: line.variantSku,
    productTitle: line.productTitle,
    quantity: line.quantity,
  };
}

/** What a draft line reads as on screen — product name leading, code alongside. */
function lineLabel(line: { productTitle: string | null; variantSku: string | null }): string {
  const title = line.productTitle ?? 'Untitled product';
  if (!line.variantSku) return title;
  return `${title} · ${line.variantSku}`;
}

/* ── Adding or editing one item ─────────────────────────────────────────── */

/**
 * The item picker.
 *
 * Adding searches the catalog for a variant; editing an existing line only
 * changes its quantity (the API cannot swap a line's variant — to change WHAT is
 * moving, remove it and add the other). It commits to the pane's draft, so the
 * PANE'S dirty guard protects a half-composed line: closing the tab with a
 * variant chosen but not added asks first, which the pane could not do on its
 * own because the line isn't part of its draft until Add.
 */
function LineEditorModal({
  open,
  line,
  existingVariantIds,
  onClose,
  onSave,
}: {
  open: boolean;
  line: DraftLine | null;
  existingVariantIds: Set<string>;
  onClose: () => void;
  onSave: (line: DraftLine) => void;
}) {
  const isEdit = line !== null;
  const products = usePickerProducts();

  const [productId, setProductId] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('1');

  // Reset every time the modal opens, so a second "Add item" never inherits the
  // last one's half-made choice.
  useEffect(() => {
    if (!open) return;
    setProductId(null);
    setVariantId(line?.variantId ?? null);
    setQuantity(line ? String(line.quantity) : '1');
  }, [open, line]);

  const variants = usePickerVariants(isEdit ? null : productId);
  const variantRows = useMemo(() => variants.data ?? [], [variants.data]);

  // A single-variant product needs no second choice — take it as soon as the
  // variants land.
  useEffect(() => {
    if (isEdit) return;
    if (variantRows.length === 1) setVariantId(variantRows[0]?.id ?? null);
  }, [isEdit, variantRows]);

  const productItems = useMemo(
    () =>
      (products.data?.items ?? []).map((product) => ({
        value: product.id,
        label: product.vendor ? `${product.title} · ${product.vendor}` : product.title,
        product,
      })),
    [products.data]
  );
  const selectedProduct = productItems.find((item) => item.value === productId) ?? null;
  const activeProduct = selectedProduct?.product ?? null;
  const needsVariant = !isEdit && (activeProduct?.variantCount ?? 0) > 1;

  const variantItems = useMemo(
    () =>
      variantRows.map((variant) => ({
        value: variant.id,
        label: variant.title ? `${variant.title} · ${variant.sku}` : variant.sku,
        variant,
      })),
    [variantRows]
  );
  const selectedVariant = variantItems.find((item) => item.value === variantId) ?? null;

  const parsedQty = Number.parseInt(quantity, 10);
  const qtyValid = Number.isFinite(parsedQty) && parsedQty > 0;
  const duplicate = !isEdit && variantId !== null && existingVariantIds.has(variantId);
  const canSave = variantId !== null && qtyValid && !duplicate;

  const changed = isEdit ? line.quantity !== parsedQty : variantId !== null || quantity !== '1';
  useDirtySource(
    open && changed,
    isEdit
      ? 'A quantity you were changing has not been added yet. Close anyway?'
      : 'You have an item you never added to this transfer. Close anyway?'
  );

  const submit = () => {
    if (!canSave || variantId === null) return;
    if (isEdit) {
      onSave({ ...line, quantity: parsedQty });
      return;
    }
    const variant = variantRows.find((row) => row.id === variantId);
    onSave({
      key: newDraftLineKey(),
      variantId,
      variantSku: variant?.sku ?? null,
      productTitle: activeProduct?.title ?? null,
      quantity: parsedQty,
    });
  };

  return (
    <PaneScope>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden">
          <DialogTitle>{isEdit ? 'Change quantity' : 'Add an item'}</DialogTitle>

          <div className="@container flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2">
            {isEdit ? (
              <div className="border-base-300 bg-base-200 flex flex-col gap-0.5 rounded-lg border p-3">
                <Text className="font-medium">{line.productTitle ?? 'Untitled product'}</Text>
                {line.variantSku ? (
                  <Text className="font-mono text-sm">{line.variantSku}</Text>
                ) : null}
                <Text className="text-sm">
                  To move something else, remove this item and add the other one.
                </Text>
              </div>
            ) : (
              <>
                <Field>
                  <FieldLabel>Product</FieldLabel>
                  <Combobox
                    color="module"
                    items={productItems}
                    value={selectedProduct}
                    disabled={products.isLoading}
                    placeholder={products.isLoading ? 'Loading products…' : 'Search products…'}
                    emptyMessage="No product matches that."
                    aria-label="Product"
                    clearable={false}
                    onValueChange={(next) => {
                      if (!next) return;
                      setProductId((next as { value: string }).value);
                      setVariantId(null);
                    }}
                  />
                  {products.isError ? (
                    <FieldDescription>
                      Your catalog could not be loaded, so there is nothing to choose from right
                      now.
                    </FieldDescription>
                  ) : null}
                </Field>

                {needsVariant ? (
                  <Field>
                    <FieldLabel>Which version</FieldLabel>
                    <Combobox
                      color="module"
                      items={variantItems}
                      value={selectedVariant}
                      placeholder="Choose a version…"
                      emptyMessage="No versions found."
                      aria-label="Product version"
                      clearable={false}
                      onValueChange={(next) => {
                        if (!next) return;
                        setVariantId((next as { value: string }).value);
                      }}
                    />
                    <FieldDescription>
                      This product is kept as more than one — a size, a color — each counted
                      separately. Pick the one you are moving.
                    </FieldDescription>
                  </Field>
                ) : null}
              </>
            )}

            <Field className="w-32">
              <FieldLabel required>How many</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className="text-right tabular-nums"
                    value={quantity}
                    onChange={(event) => {
                      setQuantity(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && canSave) submit();
                    }}
                  />
                }
              />
            </Field>

            {duplicate ? (
              <Alert color="warning">
                <AlertContent>
                  <AlertTitle>That item is already on this transfer</AlertTitle>
                  <AlertDescription>
                    Change the quantity on the item already in the list instead of adding it twice.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <Button color="neutral" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button color="module" size="sm" disabled={!canSave} onClick={submit}>
              {isEdit ? 'Save quantity' : 'Add item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}

/* ── Booking a delivery in ──────────────────────────────────────────────── */

/**
 * The receive step: adjust what actually turned up, then confirm.
 *
 * Every line defaults to the full amount sent — the common case is one click.
 * A line received short has the difference written off as lost in transit, so
 * this is where a discrepancy is recorded honestly rather than pretending
 * everything arrived. It commits to the server on confirm; abandoned, nothing
 * changes — which is why it can be a modal.
 */
function ReceiveModal({
  open,
  transfer,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  transfer: TransferDetail;
  pending: boolean;
  onClose: () => void;
  onConfirm: (lines: ReceiveLine[]) => void;
}) {
  const [received, setReceived] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setReceived(Object.fromEntries(transfer.lines.map((line) => [line.id, String(line.quantity)])));
  }, [open, transfer.lines]);

  const parsed = transfer.lines.map((line) => {
    const raw = received[line.id] ?? String(line.quantity);
    const value = Number.parseInt(raw, 10);
    const clamped = Number.isFinite(value) ? Math.max(0, Math.min(line.quantity, value)) : 0;
    return { line, clamped, short: line.quantity - clamped };
  });
  const anyShort = parsed.some((row) => row.short > 0);

  const confirm = () => {
    onConfirm(parsed.map((row) => ({ lineId: row.line.id, receivedQuantity: row.clamped })));
  };

  return (
    <PaneScope>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden">
          <DialogTitle>Book this delivery in</DialogTitle>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 py-2">
            <Text className="text-sm">
              These items are arriving at{' '}
              <span className="font-medium">
                {warehouseLabel(transfer.toWarehouseName, transfer.toWarehouseCode)}
              </span>
              . Each shows how many were sent — change it only if fewer turned up.
            </Text>

            <ul className="flex flex-col gap-2">
              {parsed.map(({ line, short }) => (
                <li
                  key={line.id}
                  className="border-base-300 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {line.productTitle ?? 'Untitled product'}
                    </span>
                    <span className="text-sm">Sent {String(line.quantity)}</span>
                  </span>
                  <label className="flex items-center gap-2">
                    <span className="text-sm">Arrived</span>
                    <Input
                      color="module"
                      size="sm"
                      type="number"
                      min={0}
                      max={line.quantity}
                      inputMode="numeric"
                      className="w-20 text-right tabular-nums"
                      aria-label={`How many ${lineLabel(line)} arrived`}
                      value={received[line.id] ?? String(line.quantity)}
                      onChange={(event) => {
                        setReceived((current) => ({ ...current, [line.id]: event.target.value }));
                      }}
                    />
                    {short > 0 ? (
                      <Badge color="warning" variant="soft" size="sm">
                        {String(short)} short
                      </Badge>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>

            {anyShort ? (
              <Alert color="warning">
                <AlertContent>
                  <AlertTitle>Some of this did not arrive</AlertTitle>
                  <AlertDescription>
                    The missing units are written off as lost in transit — they leave your total
                    stock, since they left the source but never reached the destination.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <Button color="neutral" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button color="module" size="sm" loading={pending} onClick={confirm}>
              <Truck className="size-4" aria-hidden />
              Receive it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}

/* ── Locations, as a route ──────────────────────────────────────────────── */

function LocationPickers({
  locations,
  fromId,
  toId,
  onFrom,
  onTo,
}: {
  locations: StockLocation[];
  fromId: string;
  toId: string;
  onFrom: (id: string) => void;
  onTo: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 @md:grid-cols-2">
      <Field>
        <FieldLabel>From</FieldLabel>
        <NativeSelect
          size="sm"
          value={fromId}
          aria-label="Move stock from"
          onChange={(event) => {
            onFrom(event.target.value);
          }}
        >
          <option value="">Choose a location…</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </NativeSelect>
        <FieldDescription>The location the stock leaves.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel>To</FieldLabel>
        <NativeSelect
          size="sm"
          value={toId}
          aria-label="Move stock to"
          onChange={(event) => {
            onTo(event.target.value);
          }}
        >
          <option value="">Choose a location…</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </NativeSelect>
        <FieldDescription>Where it is going.</FieldDescription>
      </Field>
    </div>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

export function TransferDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const isNew = id === 'new';

  const detailQuery = useTransfer(id);
  const detail = detailQuery.data;
  const locationsQuery = useStockLocations();

  const toast = useToast();
  const confirm = useConfirm();

  const save = useSaveTransfer();
  const dispatch = useDispatchTransfer();
  const receive = useReceiveTransfer();
  const cancel = useCancelTransfer();
  const remove = useDeleteTransfer();

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [original, setOriginal] = useState<TransferLine[]>([]);

  const [editing, setEditing] = useState<{ line: DraftLine | null } | null>(null);
  const [receiving, setReceiving] = useState(false);

  // Seed from the server once it arrives, and remember the lines it came with —
  // that snapshot is the only way to tell later which were removed.
  useEffect(() => {
    if (!detail) return;
    setFromId(detail.fromWarehouseId);
    setToId(detail.toWarehouseId);
    setNote(detail.note ?? '');
    const seeded = detail.lines.map(toDraftLine);
    setLines(seeded);
    setOriginal(detail.lines);
  }, [detail]);

  const status = detail?.status ?? 'draft';
  const state = transferState(status);
  const editableLines = isNew || status === 'draft';
  const editableLocations = isNew;

  useEffect(() => {
    ctx.setTitle(isNew ? 'New transfer' : (detail?.number ?? 'Transfer'));
  }, [ctx, isNew, detail?.number]);

  const locations = useMemo(
    () =>
      (locationsQuery.data?.items ?? []).filter(
        (location) => location.isActive && location.type !== 'virtual'
      ),
    [locationsQuery.data]
  );

  // What changed, computed rather than tracked — the pane holds no separate
  // "dirty" flag to fall out of sync.
  const originalById = useMemo(() => new Map(original.map((line) => [line.id, line])), [original]);
  const keptIds = new Set(lines.map((line) => line.id).filter(Boolean));
  const linesChanged =
    lines.some((line) => !line.id) ||
    original.some((line) => !keptIds.has(line.id)) ||
    lines.some((line) => line.id && originalById.get(line.id)?.quantity !== line.quantity);

  const sameLocation = fromId !== '' && fromId === toId;
  const dirty = isNew
    ? fromId !== '' || toId !== '' || lines.length > 0 || note.trim() !== ''
    : linesChanged;
  const canSave = isNew ? fromId !== '' && toId !== '' && !sameLocation : linesChanged;

  useDirtySource(
    dirty,
    isNew
      ? 'You have started a transfer you have not saved. Close anyway?'
      : 'This transfer has changes you have not saved. Close anyway?'
  );

  const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0);

  const commitLine = (line: DraftLine) => {
    setLines((current) => {
      const index = current.findIndex((existing) => existing.key === line.key);
      if (index === -1) return [...current, line];
      const next = [...current];
      next[index] = line;
      return next;
    });
    setEditing(null);
  };

  const removeLine = (key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
  };

  const submit = () => {
    if (!canSave) return;
    save.mutate(
      { id, fromWarehouseId: fromId, toWarehouseId: toId, note, lines, original },
      {
        onSuccess: (saved) => {
          if (isNew) {
            // A real transfer now — retarget this pane so Dispatch and every
            // later save address the saved record.
            ctx.open('inventory.transfers.detail', { id: saved.id }, { target: 'replace' });
            afterPaneChange(() => {
              toast.add({ title: `Transfer ${saved.number} started`, type: 'success' });
            });
          } else {
            toast.add({ title: 'Changes saved', type: 'success' });
          }
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save this transfer',
            description: transferErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const runDispatch = async () => {
    if (!detail) return;
    const ok = await confirm({
      title: `Send ${detail.number} on its way?`,
      description: `This takes ${plural(detail.totalQuantity, 'unit', 'units')} out of ${warehouseLabel(
        detail.fromWarehouseName,
        detail.fromWarehouseCode
      )} and marks them in transit to ${warehouseLabel(
        detail.toWarehouseName,
        detail.toWarehouseCode
      )}. Neither location can sell them until they are received.`,
      confirmLabel: 'Send it',
      cancelLabel: 'Not yet',
      color: 'warning',
    });
    if (!ok) return;
    dispatch.mutate(detail.id, {
      onSuccess: () => {
        toast.add({ title: `${detail.number} is on its way`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not send this transfer',
          description: transferErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const runReceive = (receiveLines: ReceiveLine[]) => {
    if (!detail) return;
    receive.mutate(
      { id: detail.id, lines: receiveLines },
      {
        onSuccess: () => {
          setReceiving(false);
          afterPaneChange(() => {
            toast.add({ title: `${detail.number} received`, type: 'success' });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not receive this transfer',
            description: transferErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const runCancel = async () => {
    if (!detail) return;
    const inTransit = detail.status === 'in_transit';
    const ok = await confirm({
      title: `Call off ${detail.number}?`,
      description: inTransit
        ? `Anything still in transit is returned to ${warehouseLabel(
            detail.fromWarehouseName,
            detail.fromWarehouseCode
          )}. The transfer stays on your records as cancelled.`
        : 'This draft is marked cancelled and kept on your records. Nothing has moved, so no stock changes.',
      confirmLabel: 'Call it off',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    cancel.mutate(detail.id, {
      onSuccess: () => {
        toast.add({ title: `${detail.number} cancelled`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not cancel this transfer',
          description: transferErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const runDelete = async () => {
    if (!detail) return;
    const ok = await confirm({
      title: `Delete ${detail.number}?`,
      description:
        'This draft is removed for good. It has never moved stock, so nothing else is affected.',
      confirmLabel: 'Delete draft',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(detail.id, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${detail.number} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this draft',
          description: transferErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  /* ── Load / not-found guards ──────────────────────────────────────────── */

  if (!isNew && detailQuery.isError) {
    const gone = isNotFound(detailQuery.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This transfer no longer exists' : 'Could not load this transfer'}
          description={
            gone
              ? 'It has been removed. Any stock it moved is recorded in your movement history.'
              : 'This is a problem reaching the server. Your transfer is unaffected — it just could not be read just now.'
          }
          onRetry={() => {
            void detailQuery.refetch();
          }}
        />
      </div>
    );
  }

  if ((!isNew && detailQuery.isPending) || locationsQuery.isPending) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  // Composing a transfer needs at least two places to move stock between.
  if (isNew && locations.length < 2) {
    return (
      <div className={PANE_SHELL}>
        <div className="flex h-full items-center justify-center p-8">
          <EmptyState
            icon={<PackageX className="size-6" aria-hidden />}
            title="You need two locations to move stock between"
            description="A transfer sends stock from one of your locations to another, so you need at least two set up before you can start one."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  ctx.open('inventory.warehouses.list', undefined, { target: 'tab' });
                }}
              >
                Set up a location
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const showDispatch = !isNew && status === 'draft';
  const showReceive = status === 'in_transit';
  const showCancel = status === 'in_transit';
  const showSave = editableLines;

  // The first control on the right carries the ml-auto that shoves the group over.
  const firstRight = showCancel
    ? 'cancel'
    : showDispatch
      ? 'dispatch'
      : showReceive
        ? 'receive'
        : showSave
          ? 'save'
          : 'refresh';
  const ml = (name: string) => (firstRight === name ? 'ml-auto ' : '');

  const from = detail ? warehouseLabel(detail.fromWarehouseName, detail.fromWarehouseCode) : '';
  const to = detail ? warehouseLabel(detail.toWarehouseName, detail.toWarehouseCode) : '';

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Transfer actions"
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
            {/* Goes on the tote, so the receiving end scans it rather than reading a
            reference off a docket. */}
            {detail ? (
              <Tooltip content="Print a scannable label for the tote and the paperwork">
                <Button
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  shape="square"
                  className="shrink-0"
                  aria-label="Print a scannable label for this transfer"
                  onClick={() => {
                    ctx.open(
                      'inventory.documents.label',
                      {
                        number: detail.number,
                        title: 'Transfer',
                        subtitle: `${detail.fromWarehouseName ?? ''} → ${detail.toWarehouseName ?? ''}`,
                      },
                      { target: 'beside' }
                    );
                  }}
                >
                  <Printer className="size-4" aria-hidden />
                </Button>
              </Tooltip>
            ) : null}
            {showCancel ? (
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                className={`${ml('cancel')}shrink-0 whitespace-nowrap`}
                loading={cancel.isPending}
                onClick={() => {
                  void runCancel();
                }}
              >
                <Ban className="size-4" aria-hidden />
                Cancel
              </Button>
            ) : null}
            {showDispatch ? (
              <Button
                size="sm"
                variant="outline"
                color="module"
                className={`${ml('dispatch')}shrink-0 whitespace-nowrap`}
                disabled={dirty || (detail?.lineCount ?? 0) === 0}
                title={
                  dirty
                    ? 'Save your changes before sending'
                    : (detail?.lineCount ?? 0) === 0
                      ? 'Add at least one item before sending'
                      : 'Send this transfer on its way'
                }
                loading={dispatch.isPending}
                onClick={() => {
                  void runDispatch();
                }}
              >
                <Send className="size-4" aria-hidden />
                Send it
              </Button>
            ) : null}
            {showReceive ? (
              <Button
                size="sm"
                color="module"
                className={`${ml('receive')}shrink-0 whitespace-nowrap`}
                onClick={() => {
                  setReceiving(true);
                }}
              >
                <Truck className="size-4" aria-hidden />
                Mark received
              </Button>
            ) : null}
            {showSave ? (
              <Button
                size="sm"
                color="module"
                className={`${ml('save')}shrink-0 whitespace-nowrap`}
                disabled={!canSave || save.isPending}
                loading={save.isPending}
                onClick={submit}
              >
                {isNew ? 'Start transfer' : 'Save'}
              </Button>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className={ml('refresh').trim()}
            isFetching={detailQuery.isFetching}
            updatedAt={detail ? detailQuery.dataUpdatedAt : undefined}
            onRefresh={() => {
              void detailQuery.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* Identity + route. A read-only detail opens by saying WHAT it is; a
              new one says what it will become. */}
          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <Heading level={1} className="font-mono text-2xl font-semibold break-words">
                {isNew ? 'New transfer' : (detail?.number ?? 'Transfer')}
              </Heading>
              <Text className="text-sm">{transferStatusBlurb(status)}</Text>
            </div>

            {editableLocations ? (
              <LocationPickers
                locations={locations}
                fromId={fromId}
                toId={toId}
                onFrom={setFromId}
                onTo={setToId}
              />
            ) : (
              <div className="border-base-300 flex flex-wrap items-center gap-2 border-t pt-3 text-lg">
                <span className="font-medium">{from}</span>
                <ArrowRight className="size-5 shrink-0" aria-hidden />
                <span className="font-medium">{to}</span>
              </div>
            )}

            {sameLocation ? (
              <Alert color="warning">
                <AlertContent>
                  <AlertTitle>Pick two different locations</AlertTitle>
                  <AlertDescription>
                    A transfer moves stock between two places, so the from and to cannot be the same
                    one.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null}

            {editableLocations ? (
              <Field>
                <FieldLabel>Note (optional)</FieldLabel>
                <FieldControl
                  render={
                    <Textarea
                      color="module"
                      rows={2}
                      value={note}
                      placeholder="Anything the receiving location should know."
                      onChange={(event) => {
                        setNote(event.target.value);
                      }}
                    />
                  }
                />
                <FieldDescription>Kept with the transfer for reference.</FieldDescription>
              </Field>
            ) : detail?.note ? (
              <Text className="text-sm">{detail.note}</Text>
            ) : null}

            {/* The record of what happened, once anything has. */}
            {detail && (detail.shippedAt || detail.receivedAt || detail.cancelledAt) ? (
              <ul className="border-base-300 flex flex-col gap-1 border-t pt-3 text-sm">
                {detail.shippedAt ? (
                  <li>
                    Sent <Timestamp value={detail.shippedAt} format="relative" />
                  </li>
                ) : null}
                {detail.receivedAt ? (
                  <li>
                    Received <Timestamp value={detail.receivedAt} format="relative" />
                  </li>
                ) : null}
                {detail.cancelledAt ? (
                  <li>
                    Cancelled <Timestamp value={detail.cancelledAt} format="relative" />
                  </li>
                ) : null}
              </ul>
            ) : null}
          </section>

          {/* Items. */}
          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <Heading level={2} className="text-lg font-semibold">
                Items
              </Heading>
              {editableLines ? (
                <Button
                  size="sm"
                  color="module"
                  variant="soft"
                  onClick={() => {
                    setEditing({ line: null });
                  }}
                >
                  <PackagePlus className="size-4" aria-hidden />
                  Add item
                </Button>
              ) : (
                <Text className="text-sm">
                  {plural(lines.length, 'item', 'items')} · {String(totalQty)} in total
                </Text>
              )}
            </div>

            {/* Scanning a pallet onto a transfer beats searching for each item
                by name, so it sits above the list rather than behind the "Add
                item" dialog. Only on a saved draft: a transfer that has not been
                created yet has nothing for a scan to attach to, and one already
                in transit describes a box on a truck. */}
            {!isNew && status === 'draft' && detail ? (
              <ScanIntoTransfer transferId={detail.id} />
            ) : null}

            {lines.length === 0 ? (
              <EmptyState
                icon={<Package className="size-6" aria-hidden />}
                title={editableLines ? 'No items yet' : 'This transfer had no items'}
                description={
                  editableLines
                    ? 'Add the items you are moving. You can send the transfer once it has at least one.'
                    : 'Nothing was ever added to this transfer.'
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {lines.map((line) => {
                  const serverLine = line.id ? originalById.get(line.id) : undefined;
                  const shortfall =
                    serverLine && serverLine.receivedQuantity !== null
                      ? serverLine.quantity - serverLine.receivedQuantity
                      : 0;
                  return (
                    <li
                      key={line.key}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {line.productTitle ?? 'Untitled product'}
                        </span>
                        {line.variantSku ? (
                          <span className="truncate font-mono text-sm">{line.variantSku}</span>
                        ) : null}
                      </span>
                      <div className="flex items-center gap-2">
                        <Text className="whitespace-nowrap tabular-nums">
                          {status === 'received' && serverLine?.receivedQuantity !== null
                            ? `${String(serverLine?.receivedQuantity ?? 0)} of ${String(
                                line.quantity
                              )} arrived`
                            : plural(line.quantity, 'unit', 'units')}
                        </Text>
                        {shortfall > 0 ? (
                          <Badge color="warning" variant="soft" size="sm">
                            {String(shortfall)} short
                          </Badge>
                        ) : null}
                        {editableLines ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              color="neutral"
                              shape="square"
                              aria-label={`Change quantity of ${lineLabel(line)}`}
                              onClick={() => {
                                setEditing({ line });
                              }}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              color="neutral"
                              shape="square"
                              aria-label={`Remove ${lineLabel(line)}`}
                              onClick={() => {
                                removeLine(line.key);
                              }}
                            >
                              <X className="size-4" aria-hidden />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Throwing a draft away — rare and irreversible, so it sits after the
              work, under its own divider, never as a full card competing with
              the items above. */}
          {!isNew && status === 'draft' ? (
            <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Text className="text-sm">
                Not going ahead with this? A draft that never shipped can be removed entirely.
              </Text>
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                loading={remove.isPending}
                onClick={() => {
                  void runDelete();
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Delete draft
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <LineEditorModal
        open={editing !== null}
        line={editing?.line ?? null}
        existingVariantIds={new Set(lines.map((line) => line.variantId))}
        onClose={() => {
          setEditing(null);
        }}
        onSave={commitLine}
      />

      {detail ? (
        <ReceiveModal
          open={receiving}
          transfer={detail}
          pending={receive.isPending}
          onClose={() => {
            setReceiving(false);
          }}
          onConfirm={runReceive}
        />
      ) : null}
    </div>
  );
}
