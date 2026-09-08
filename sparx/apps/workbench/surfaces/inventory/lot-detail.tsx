'use client';

// ONE BATCH — what it is, where it is, how much it held, when it goes off, where
// it came from, and where its individually-numbered units went.
//
// ── A read-only-leaning detail, so it opens by saying WHAT it is ──────────
//
// The batch code is the identity of this record and the heading carries it, with
// the product it is a batch OF underneath. This is a traceability record, like an
// order or a stock movement — you are reading its history, not renaming it — so
// it keeps an identity heading rather than opening on an editable field.
//
// ── The two things you can actually DO here ──────────────────────────────
//
// The batch itself is not editable through the API (a batch's facts are set when
// it is booked in and are the audit trail afterwards), so there is no save form
// and no dirty guard on the batch. The two writes are lifecycle moves:
//   • Clearing a recall — resolving a safety hold, done right next to the reason
//     it was raised so the decision is made with the context in view.
//   • Changing one unit's status — in the roster, where the unit is.
// Both are single, reversible status changes, so each commits immediately; only
// the "gone for good" ones (scrapped / lost) stop to confirm, because those take
// the unit out of every count.
//
// ── Not EditorLayout ─────────────────────────────────────────────────────
//
// There is no completion-ordered form and no running summary to sit beside one —
// it is a heading, a handful of facts, and a roster. One centred, capped column.

import { useEffect, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  Heading,
  NativeSelect,
  Text,
  Timestamp,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  Boxes,
  CalendarClock,
  Factory,
  Layers,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { ListPagination, MAX_TAKE, type PageSize } from '../../components/list-pagination';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { isNotFound, plural, stockErrorMessage } from './data';
import {
  describeExpiry,
  hazmatLabel,
  isTerminalSerialStatus,
  lotLocationLabel,
  lotState,
  recallState,
  serialStatusState,
  SERIAL_STATUSES,
  useClearRecall,
  useLot,
  useLotSerials,
  useUpdateSerialStatus,
  type LotDetail,
  type SerialRow,
} from './lots-data';
import { PaneLoadError } from '../../components/pane-load-error';

/** Centred and capped — a pane torn onto a second monitor is 2000px wide, and
 *  uncapped this becomes facts pinned to the left edge with a badge a foot away. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/* ── One fact ───────────────────────────────────────────────────────────── */

/** A label and its value, read as a pair. Both get real ink — the label is not
 *  faded, it is simply smaller, because hierarchy is scale and weight here. */
function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-module mt-0.5 shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="flex min-w-0 flex-col">
        <Text className="text-sm font-medium">{label}</Text>
        <div className="min-w-0 text-base break-words">{children}</div>
      </div>
    </div>
  );
}

/* ── One unit in the roster ─────────────────────────────────────────────── */

function SerialRosterRow({ serial }: { serial: SerialRow }) {
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateSerialStatus();
  const state = serialStatusState(serial.status);

  const change = async (next: string) => {
    if (next === serial.status) return;

    if (isTerminalSerialStatus(next)) {
      const word = next === 'scrapped' ? 'scrapped' : 'lost';
      const ok = await confirm({
        title: `Mark unit ${serial.serial} as ${word}?`,
        description: `This takes the unit out of every count for good and records the change against your name so it can be traced later. If you meant something else, pick a different status.`,
        confirmLabel: `Yes, it is ${word}`,
        cancelLabel: 'Go back',
        color: 'danger',
      });
      if (!ok) return;
    }

    update.mutate(
      { serialId: serial.id, status: next, lotBatchId: serial.lotBatchId },
      {
        onSuccess: () => {
          toast.add({
            title: `Unit ${serial.serial} updated`,
            description: `Now recorded as ${serialStatusState(next).label.toLowerCase()}.`,
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not change that unit',
            description: stockErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <div className="flex min-w-0 flex-col">
        <Text className="min-w-0 font-mono break-all">{serial.serial}</Text>
        {serial.status === 'sold' && serial.soldAt ? (
          <Text className="text-sm">
            Left on an order <Timestamp value={serial.soldAt} format="relative" />
          </Text>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
        <NativeSelect
          size="sm"
          className="max-w-36"
          aria-label={`Change status of unit ${serial.serial}`}
          value={serial.status}
          disabled={update.isPending}
          onChange={(event) => {
            void change(event.target.value);
          }}
        >
          {SERIAL_STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </li>
  );
}

/* ── The serial roster ──────────────────────────────────────────────────── */

function SerialRoster({ lot }: { lot: LotDetail }) {
  const [status, setStatus] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<number>(50);
  const skip = (page - 1) * pageSize;

  const { data, isLoading, isError, isFetching } = useLotSerials(lot.id, {
    ...(status ? { status } : {}),
    take,
    skip,
  });
  const rows = data?.items ?? [];
  const total = data?.total;

  const resetWindow = () => {
    setPage(1);
    setTake(pageSize);
  };

  // A batch can be tracked purely as a whole — no individual units under it. That
  // is a valid record, not an empty one, so it says so plainly rather than
  // inviting an action that does not belong here.
  if (lot.serialCount === 0) {
    return (
      <section className="card bg-base-100 flex flex-col gap-2 p-4">
        <Heading level={2} className="text-lg font-semibold">
          Individual units
        </Heading>
        <Text className="text-base">
          This batch is traced as a whole — no unit inside it carries its own serial number. Units
          get their own numbers when they are booked in individually.
        </Text>
      </section>
    );
  }

  const summary = lot.serialCounts
    .map(
      (entry) =>
        `${plural(entry.count, 'unit', 'units')} ${serialStatusState(entry.status).label.toLowerCase()}`
    )
    .join(' · ');

  return (
    <section className="card bg-base-100 flex flex-col gap-3 p-4">
      <div className="border-base-300 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Heading level={2} className="text-lg font-semibold">
            Individual units
          </Heading>
          <Text className="text-sm">
            {summary || `${plural(lot.serialCount, 'unit', 'units')} in this batch`} — where each
            one is now, and which have left.
          </Text>
        </div>
        <NativeSelect
          size="sm"
          className="max-w-40 shrink-0"
          aria-label="Filter units by status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            resetWindow();
          }}
        >
          <option value="">Any status</option>
          {SERIAL_STATUSES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      {isError ? (
        <Text className="text-base">
          The units could not be read just now. The batch itself is unaffected — try refreshing.
        </Text>
      ) : isLoading ? (
        <p className="text-sm" role="status">
          Loading units…
        </p>
      ) : rows.length === 0 ? (
        <Text className="text-base">
          No units match that status. Choose “Any status” to see all of them.
        </Text>
      ) : (
        <ul className="divide-base-300 flex flex-col divide-y">
          {rows.map((serial) => (
            <SerialRosterRow key={serial.id} serial={serial} />
          ))}
        </ul>
      )}

      {!isError && !isLoading && (rows.length > 0 || total !== undefined) ? (
        <ListPagination
          shown={rows.length}
          firstRow={rows.length === 0 ? 0 : skip + 1}
          total={total}
          page={page}
          pageSize={pageSize}
          canLoadMore={take < MAX_TAKE}
          busy={isFetching}
          onLoadMore={() => {
            setTake((current) => Math.min(current + pageSize, MAX_TAKE));
          }}
          onPageChange={(next) => {
            setPage(next);
            setTake(pageSize);
          }}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setTake(size);
          }}
        />
      ) : null}
    </section>
  );
}

/* ── The pane ───────────────────────────────────────────────────────────── */

export function LotDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : '';

  const toast = useToast();
  const confirm = useConfirm();
  const lot = useLot(id);
  const clearRecall = useClearRecall();

  const lotNumber = lot.data?.lotNumber ?? null;
  useEffect(() => {
    if (lotNumber) ctx.setTitle(lotNumber);
  }, [ctx, lotNumber]);

  // A pane opened without an id is a broken link, not a loading state.
  if (id === '') {
    return (
      <div className={PANE_SHELL}>
        <div className="flex h-full items-center justify-center p-8">
          <EmptyState
            icon={<Layers className="size-6" aria-hidden />}
            title="No batch was chosen"
            description="This pane traces one batch. Open it from the Lots & serials list by clicking a row."
            actions={
              <Button
                size="sm"
                color="module"
                onClick={() => {
                  ctx.open('inventory.lots.list', undefined, { target: 'replace' });
                }}
              >
                Open the list
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  // A failed load REPLACES the pane — never empty facts beside a live action.
  if (lot.isError) {
    const gone = isNotFound(lot.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This batch no longer exists' : 'Could not load this batch'}
          description={
            gone
              ? 'It has been removed. Any orders and stock history that referenced it are unaffected.'
              : 'This is a problem reaching the server. The batch record is unaffected — it just could not be read just now.'
          }
          onRetry={() => {
            void lot.refetch();
          }}
        />
      </div>
    );
  }

  if (lot.isPending) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  const data = lot.data;
  const state = lotState(data);
  const expiry = describeExpiry(data.expiresAt);
  const recall = recallState(data.recallStatus);
  const hazard = hazmatLabel(data.hazmatClass);
  const openRecall = data.recallStatus === 'active' || data.recallStatus === 'pending';

  const doClearRecall = async () => {
    const ok = await confirm({
      title: `Clear the recall on batch ${data.lotNumber}?`,
      description:
        'This records that the problem is resolved and the batch can be handled normally again. Units already marked recalled keep that history.',
      confirmLabel: 'Yes, clear the recall',
      cancelLabel: 'Go back',
      color: 'warning',
    });
    if (!ok) return;
    clearRecall.mutate(data.id, {
      onSuccess: () => {
        afterPaneChange(() => {
          toast.add({ title: `Recall cleared on ${data.lotNumber}`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not clear the recall',
          description: stockErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Batch actions"
        primary={
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            className="ml-auto shrink-0 whitespace-nowrap"
            title="Open this item's stock"
            onClick={(event) => {
              ctx.open(
                'inventory.stock.item',
                { variantId: data.variantId },
                { target: event.shiftKey ? 'beside' : 'tab' }
              );
            }}
          >
            <Boxes className="size-4" aria-hidden />
            <span className="hidden @xl:inline">Item stock</span>
          </Button>
        }
        controls={
          <>
            <Badge color={state.tone} variant="soft" size="sm">
              {state.label}
            </Badge>
          </>
        }
        refresh={
          <RefreshButton
            isFetching={lot.isFetching}
            updatedAt={lot.data ? lot.dataUpdatedAt : undefined}
            onRefresh={() => {
              void lot.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* Identity first: the batch code, then the product it is a batch of. */}
          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <div className="flex min-w-0 items-start gap-3">
              <Layers className="text-module mt-1 size-6 shrink-0" aria-hidden />
              <div className="flex min-w-0 flex-col gap-0.5">
                <Heading level={1} className="min-w-0 font-mono text-2xl font-semibold break-all">
                  {data.lotNumber}
                </Heading>
                <Text className="min-w-0 text-base break-words">
                  {data.productTitle ?? 'Untitled product'}
                  {data.variantSku ? ` · ${data.variantSku}` : ''}
                </Text>
              </div>
            </div>
          </section>

          {/* A live recall is the loudest thing on the screen, and the decision to
              clear it is made right here with its reason in view. */}
          {openRecall ? (
            <Alert color={data.recallStatus === 'active' ? 'danger' : 'warning'} variant="soft">
              <AlertContent>
                <AlertTitle>
                  {data.recallStatus === 'active'
                    ? 'This batch is recalled'
                    : 'A recall is pending on this batch'}
                </AlertTitle>
                <AlertDescription>
                  {data.recallReason ? `Reason: ${data.recallReason}. ` : ''}
                  {data.recalledAt ? 'Raised ' : ''}
                  {data.recalledAt ? <Timestamp value={data.recalledAt} format="relative" /> : null}
                  {data.recalledAt ? '. ' : ''}
                  Do not sell units from this batch until the problem is resolved.
                </AlertDescription>
              </AlertContent>
              <Button
                size="sm"
                color={data.recallStatus === 'active' ? 'danger' : 'warning'}
                variant="soft"
                loading={clearRecall.isPending}
                onClick={() => {
                  void doClearRecall();
                }}
              >
                <ShieldCheck className="size-4" aria-hidden />
                Clear recall
              </Button>
            </Alert>
          ) : recall ? (
            // A cleared recall is history worth keeping visible — it tells the next
            // person the problem was looked at and resolved.
            <Alert color="success" variant="soft">
              <AlertContent>
                <AlertTitle>A past recall on this batch has been cleared</AlertTitle>
                <AlertDescription>
                  {data.recallReason
                    ? `It was raised for: ${data.recallReason}. It has since been marked resolved.`
                    : 'It has been marked resolved.'}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {/* The facts of the batch. */}
          <section className="card bg-base-100 flex flex-col gap-4 p-4">
            <Heading level={2} className="text-lg font-semibold">
              About this batch
            </Heading>

            <div className="grid gap-4 @md:grid-cols-2">
              <Fact icon={<Layers className="size-4" aria-hidden />} label="Units in this batch">
                <span className="text-xl font-semibold tabular-nums">{data.quantity}</span>
                <Text className="text-sm">
                  How many the batch held. What a shopper can buy is the item’s live stock, not
                  this.
                </Text>
              </Fact>

              <Fact icon={<MapPin className="size-4" aria-hidden />} label="Where it is kept">
                {lotLocationLabel(data)}
              </Fact>

              <Fact icon={<CalendarClock className="size-4" aria-hidden />} label="Expiry">
                {expiry ? (
                  <span className="inline-flex items-center gap-2">
                    {data.expiresAt ? <Timestamp value={data.expiresAt} format="absolute" /> : null}
                    <Badge color={expiry.tone} variant="soft" size="sm">
                      {expiry.long}
                    </Badge>
                  </span>
                ) : (
                  <Text className="text-base">This product does not expire.</Text>
                )}
              </Fact>

              <Fact icon={<Factory className="size-4" aria-hidden />} label="When it was made">
                {data.manufacturedAt ? (
                  <Timestamp value={data.manufacturedAt} format="absolute" />
                ) : (
                  <Text className="text-base">Not recorded.</Text>
                )}
              </Fact>

              <Fact
                icon={<Truck className="size-4" aria-hidden />}
                label="Supplier’s batch reference"
              >
                {data.supplierBatchRef ? (
                  <Text className="font-mono text-base break-all">{data.supplierBatchRef}</Text>
                ) : (
                  <Text className="text-base">
                    None recorded. This is the code you would quote back to your supplier.
                  </Text>
                )}
              </Fact>

              {hazard ? (
                <Fact icon={<ShieldAlert className="size-4" aria-hidden />} label="Handling">
                  <Badge color="warning" variant="soft" size="sm">
                    {hazard}
                  </Badge>
                </Fact>
              ) : null}

              <Fact icon={<CalendarClock className="size-4" aria-hidden />} label="Added">
                <Timestamp value={data.createdAt} format="absolute" />
              </Fact>
            </div>
          </section>

          <SerialRoster lot={data} />
        </div>
      </div>
    </div>
  );
}
