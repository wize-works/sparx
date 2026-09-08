'use client';

// PREORDERS — selling something before it exists, on purpose and in writing.
//
// The setting has been there since the beginning and meant nothing: an item with
// its policy set to "preorder" simply sold past zero and told the customer
// nothing. This screen is the difference between that and an OFFER — a window
// that opens and closes on dates you chose, for a number of units you are
// willing to owe, with something honest to say about when it ships.
//
// ── The date is allowed to be missing ─────────────────────────────────────
//
// The strongest instinct here is to make the availability date required. It is
// wrong. A maker who has not committed to a date is completely ordinary, and a
// merchant forced to fill the field will type something — which then appears on
// the product page as a commitment, in the confirmation email, and in a
// customer's diary. So a window may say "date to be confirmed", which sells
// perfectly well, and the note carries the human version.
//
// ── One live window per item ──────────────────────────────────────────────
//
// Enforced in the database, not just here. Two live windows means two different
// dates promised for the same product, and the way that happens is two people in
// two tabs on an ordinary Tuesday.

import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Switch,
  Table,
  Text,
  Textarea,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { CalendarClock, CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterCommit } from '../../lib/defer';
import { useConfirm } from '../../lib/confirm';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { plural, stockErrorMessage } from './data';
import {
  preorderStateLabel,
  preorderTone,
  usePreorderWindows,
  useClosePreorder,
  useUpdatePreorder,
  type PreorderWindow,
} from './demand-data';

function toDateInput(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}
function toIso(value: string): string | null {
  return value ? new Date(`${value}T00:00:00Z`).toISOString() : null;
}

export function PreordersSurface(_props: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
  const list = usePreorderWindows(status ? { status } : {});
  const [editing, setEditing] = useState<PreorderWindow | null>(null);

  const rows = list.data?.items ?? [];
  const live = rows.filter((r) => r.isTakingOrders);
  const committed = rows.reduce((sum, r) => sum + r.soldQuantity, 0);

  const body = () => {
    if (list.isError) {
      return (
        <EmptyState
          icon={<CalendarClock className="size-6" aria-hidden />}
          title="Could not load your preorders"
          description="This is a problem reaching the server. Try again in a moment."
        />
      );
    }
    if (list.isLoading) {
      return (
        <p className="p-4 text-base" role="status">
          Loading preorders…
        </p>
      );
    }
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={<CalendarPlus className="size-6" aria-hidden />}
          title="No preorders running"
          description="Open one from a product's stock screen when you want to take orders for something before it arrives — a production run, a seasonal line, a restock you have already paid for."
        />
      );
    }

    return (
      <Table size="sm" hover>
        <thead>
          <tr>
            <th>Item</th>
            <th className="whitespace-nowrap">Ships</th>
            <th className="text-right whitespace-nowrap">Committed</th>
            <th className="hidden whitespace-nowrap @lg:table-cell">Window</th>
            <th className="whitespace-nowrap">State</th>
            <th className="text-right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="w-full max-w-0">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">
                    {row.variantName ?? row.variantSku ?? 'Unnamed item'}
                    {row.variantSku && row.variantName ? (
                      <span className="ml-1.5 font-mono text-sm">{row.variantSku}</span>
                    ) : null}
                  </span>
                  {row.availabilityNote ? (
                    <span className="truncate text-sm">{row.availabilityNote}</span>
                  ) : null}
                </span>
              </td>
              <td className="whitespace-nowrap">
                {/* "To be confirmed" is a real answer and reads as one. A blank
                    cell here would look like a bug and an invented date would be
                    a promise nobody made. */}
                {row.availableAt ? (
                  <Timestamp value={row.availableAt} format="absolute" />
                ) : (
                  <Badge color="warning" variant="soft" size="sm">
                    To be confirmed
                  </Badge>
                )}
              </td>
              <td className="text-right whitespace-nowrap tabular-nums">
                {row.soldQuantity}
                {/* Only when capped. `remaining` is null for an uncapped run and
                    there is no honest number for "no limit". */}
                {row.remaining !== null ? (
                  <span className="text-sm"> · {row.remaining} left</span>
                ) : null}
              </td>
              <td className="hidden whitespace-nowrap @lg:table-cell">
                {row.startsAt ? <Timestamp value={row.startsAt} format="absolute" /> : 'Now'}
                {' → '}
                {row.endsAt ? <Timestamp value={row.endsAt} format="absolute" /> : 'open-ended'}
              </td>
              <td className="whitespace-nowrap">
                <Badge color={preorderTone(row)} variant="soft" size="sm">
                  {preorderStateLabel(row)}
                </Badge>
              </td>
              <td className="text-right whitespace-nowrap">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setEditing(row);
                  }}
                >
                  Edit
                </Button>
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
        label="Preorder controls"
        status={
          <Text className="text-sm">
            {live.length > 0
              ? `${plural(live.length, 'preorder', 'preorders')} taking orders · ${plural(committed, 'unit', 'units')} committed`
              : 'Nothing taking preorders'}
          </Text>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              className="max-w-40 shrink"
              aria-label="Which preorders"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
              }}
            >
              <option value="">All</option>
              <option value="open">Running</option>
              <option value="scheduled">Not started</option>
              <option value="closed">Finished</option>
              <option value="cancelled">Cancelled</option>
            </NativeSelect>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={list.isFetching}
            updatedAt={list.data ? list.dataUpdatedAt : undefined}
            onRefresh={() => {
              void list.refetch();
            }}
          />
        }
      />

      <Card className="min-h-0 flex-1 overflow-auto">{body()}</Card>

      {editing ? (
        <PreorderEditor
          window={editing}
          onClose={() => {
            setEditing(null);
          }}
          onFail={(title, error) => {
            afterCommit(() => {
              toast.add({
                title,
                description: stockErrorMessage(error, 'Nothing was changed.'),
                type: 'error',
              });
            });
          }}
          onSaved={() => {
            afterCommit(() => {
              toast.add({ title: 'Preorder updated', type: 'success' });
            });
          }}
          confirm={confirm}
          onClosed={() => {
            afterCommit(() => {
              toast.add({
                title: 'Preorder closed',
                description: 'Existing commitments are unaffected — they are still owed.',
                type: 'info',
              });
            });
          }}
        />
      ) : null}
    </div>
  );
}

function PreorderEditor({
  window: row,
  onClose,
  onSaved,
  onClosed,
  onFail,
  confirm,
}: {
  window: PreorderWindow;
  onClose: () => void;
  onSaved: () => void;
  onClosed: () => void;
  onFail: (title: string, error: unknown) => void;
  confirm: ReturnType<typeof useConfirm>;
}) {
  const update = useUpdatePreorder(row.id);
  const close = useClosePreorder(row.id);

  const [availableAt, setAvailableAt] = useState(toDateInput(row.availableAt));
  const [note, setNote] = useState(row.availabilityNote ?? '');
  const [startsAt, setStartsAt] = useState(toDateInput(row.startsAt));
  const [endsAt, setEndsAt] = useState(toDateInput(row.endsAt));
  const [capped, setCapped] = useState(row.isCapped);
  const [maxQuantity, setMaxQuantity] = useState(String(row.maxQuantity || ''));
  const [chargeUpFront, setChargeUpFront] = useState(row.chargeUpFront);

  const canEdit = row.effectiveStatus === 'open' || row.effectiveStatus === 'scheduled';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{row.variantName ?? row.variantSku ?? 'Preorder'}</DialogTitle>
        <DialogDescription>
          Leave the shipping date blank if the maker has not committed to one. The product page then
          says “date to be confirmed”, which sells honestly — a guess in this field becomes a
          promise the moment somebody reads it.
        </DialogDescription>

        <div className="flex flex-col gap-3 py-2">
          <Field>
            <FieldLabel>Ships on</FieldLabel>
            <Input
              type="date"
              value={availableAt}
              onChange={(event) => {
                setAvailableAt(event.target.value);
              }}
            />
          </Field>

          <Field>
            <FieldLabel>What to tell people instead, or as well</FieldLabel>
            <Textarea
              rows={2}
              value={note}
              placeholder="Ships with the spring run"
              onChange={(event) => {
                setNote(event.target.value);
              }}
            />
          </Field>

          <div className="grid gap-3 @md:grid-cols-2">
            <Field>
              <FieldLabel>Opens</FieldLabel>
              <Input
                type="date"
                value={startsAt}
                onChange={(event) => {
                  setStartsAt(event.target.value);
                }}
              />
            </Field>
            <Field>
              <FieldLabel>Closes</FieldLabel>
              <Input
                type="date"
                value={endsAt}
                onChange={(event) => {
                  setEndsAt(event.target.value);
                }}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>Limit how many you will owe</FieldLabel>
            <Switch
              checked={capped}
              onCheckedChange={(next) => {
                setCapped(next);
              }}
            />
            <Text className="text-sm">
              {capped
                ? 'Once the limit is reached the product page says sold out.'
                : 'No limit — sensible for made-to-order, risky for anything else.'}
            </Text>
          </Field>

          {capped ? (
            <Field>
              <FieldLabel>How many</FieldLabel>
              <Input
                type="number"
                min={Math.max(1, row.soldQuantity)}
                value={maxQuantity}
                onChange={(event) => {
                  setMaxQuantity(event.target.value);
                }}
              />
              {row.soldQuantity > 0 ? (
                <Text className="text-sm">
                  {row.soldQuantity} already committed — the limit cannot go below that.
                </Text>
              ) : null}
            </Field>
          ) : null}

          <Field>
            <FieldLabel>Take payment now</FieldLabel>
            <Switch
              checked={chargeUpFront}
              onCheckedChange={(next) => {
                setChargeUpFront(next);
              }}
            />
          </Field>
        </div>

        <DialogFooter>
          {canEdit ? (
            <Button
              color="danger"
              variant="soft"
              disabled={close.isPending}
              onClick={() => {
                void confirm({
                  title: 'Stop taking preorders?',
                  description: `${plural(row.soldQuantity, 'order', 'orders')} already committed stay owed — closing only stops new ones. The window and its history are kept.`,
                  confirmLabel: 'Stop taking them',
                  cancelLabel: 'Keep it open',
                  color: 'danger',
                }).then((confirmed) => {
                  if (!confirmed) return;
                  close.mutate('closed', {
                    onSuccess: () => {
                      onClose();
                      onClosed();
                    },
                    onError: (error) => {
                      onFail('Could not close it', error);
                    },
                  });
                });
              }}
            >
              Close it
            </Button>
          ) : null}
          <DialogClose>
            <Button variant="outline" color="neutral">
              Cancel
            </Button>
          </DialogClose>
          <Button
            color="module-inventory"
            disabled={update.isPending || !canEdit}
            onClick={() => {
              update.mutate(
                {
                  availableAt: toIso(availableAt),
                  availabilityNote: note.trim() === '' ? null : note.trim(),
                  startsAt: toIso(startsAt),
                  endsAt: toIso(endsAt),
                  isCapped: capped,
                  maxQuantity: capped ? Number(maxQuantity) || 0 : 0,
                  chargeUpFront,
                },
                {
                  onSuccess: () => {
                    onClose();
                    onSaved();
                  },
                  onError: (error) => {
                    onFail('Could not save that', error);
                  },
                }
              );
            }}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
