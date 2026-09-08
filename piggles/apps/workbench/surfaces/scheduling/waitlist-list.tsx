'use client';

// Waiting list — the people who want a slot that is full, so a cancellation can
// be filled instead of lost.
//
// A waitlist entry is a multi-attribute record — who, which service, the window
// they would take, how long they have waited, where they stand — so it earns a
// table: each column answers a different question scanned across. It can also run
// long (a busy service accretes dozens), so search, filtering and paging are all
// SERVER-side: "the next fifty people waiting" is a question about the whole list,
// not about whichever page happens to be loaded.
//
// There is no detail pane: the things you do to an entry — offer them a freed
// slot, book them in when they accept, take them off — are quick decisions made
// right on the row. Adding someone is the one modal here: two-and-a-bit fields,
// no entry surface to return to, over in seconds (the Invite-teammate shape).
//
// Booking someone in is NOT a modal, though. It produces a real, addressable
// booking, so it lands the operator ON that booking's pane — the row expands to
// pick a time inside their window, then hands off to the booking it creates.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useId, useMemo, useState } from 'react';
import { PaneWaiting } from '../../components/pane-waiting';
import { ListEmptyState } from '../../components/list-empty-state';
import { PaneLoadError } from '../../components/pane-load-error';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  SearchInput,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Table } from '../../components/table';
import { useConfirm } from '../../lib/confirm';
import {
  faCalendarPlus,
  faHourglass,
  faPaperPlane,
  faPlus,
  faUserMinus,
  faXmark,
} from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import type { SurfaceContext } from '../../lib/surfaces/registry';

/** Registry module for this pane, so the brand draws Bookings' own picture rather
 *  than the generic one. */
const MODULE = 'scheduling';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { PaneScope } from '../../lib/dock/window-boundary';
import { afterPaneChange } from '../../lib/defer';
import { CustomerPicker } from './bookings-customer-picker';
import { SaveFailure } from '@/components/save-failure';
import {
  formatDay,
  formatWhen,
  fromLocalInputValue,
  schedulingErrorMessage,
  toLocalInputValue,
  useAcceptWaitlist,
  useCreateWaitlistEntry,
  useOfferWaitlist,
  useRemoveWaitlist,
  useSchedulingServices,
  useWaitlist,
  waitlistStateMeta,
  type CustomerLite,
  type WaitlistEntry,
  type WaitlistStatus,
} from './bookings-data';

const OFFER_TTL_MINUTES = 60;
const PAGE_SIZE = 50;

const STATUS_OPTIONS: { value: WaitlistStatus | ''; label: string }[] = [
  { value: '', label: 'Everyone' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'offered', label: 'Slot offered' },
  { value: 'booked', label: 'Booked in' },
  { value: 'expired', label: 'Lapsed' },
  { value: 'cancelled', label: 'Removed' },
];

/* ══════════════════════════════════════════════════════════════════════════
   THE SURFACE
   ══════════════════════════════════════════════════════════════════════════ */

export function WaitlistSurface({ ctx }: { ctx: SurfaceContext }) {
  const [search, setSearch] = useState('');
  const [needle, setNeedle] = useState('');
  const [status, setStatus] = useState<WaitlistStatus | ''>('waiting');
  const [serviceId, setServiceId] = useState('');
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);

  const services = useSchedulingServices('');
  const serviceList = services.data?.items ?? [];

  // Debounce the free-text box before it becomes a server query — a keystroke a
  // request is a lot of load against a list this can grow to.
  useEffect(() => {
    const handle = setTimeout(() => {
      setNeedle(search.trim());
    }, 300);
    return () => {
      clearTimeout(handle);
    };
  }, [search]);

  // Any narrowing invalidates the page cursor — page 3 of the old result set is
  // meaningless against a new one.
  useEffect(() => {
    setPage(0);
  }, [needle, status, serviceId]);

  const query = useMemo(
    () => ({
      q: needle || undefined,
      ...(serviceId ? { serviceId } : {}),
      status,
      take: PAGE_SIZE,
      skip: page * PAGE_SIZE,
    }),
    [needle, serviceId, status, page]
  );

  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useWaitlist(query);
  const rows = data?.items ?? [];
  const total = data?.total;

  // The default view is the browse view (everyone waiting) — only an explicit
  // search, a service pick, or a status other than "waiting"/"Everyone" is a
  // narrowing, and only THAT turns an empty result into "no matches" rather than
  // "no one is here yet".
  const narrowed = Boolean(needle) || Boolean(serviceId) || (status !== '' && status !== 'waiting');

  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = page * PAGE_SIZE + rows.length;
  const canPrev = page > 0;
  const canNext = total === undefined ? rows.length === PAGE_SIZE : to < total;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Waiting list controls"
        search={
          <div className="max-w-xs min-w-0 flex-1">
            <SearchInput
              size="sm"
              aria-label="Search the waiting list"
              placeholder="Search name, email or service…"
              value={search}
              onValueChange={setSearch}
            />
          </div>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Icon glyph={faPlus} className="size-4" aria-hidden />
            Add someone
          </Button>
        }
        controls={
          <>
            <NativeSelect
              size="sm"
              aria-label="Filter by state"
              className="w-auto"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as WaitlistStatus | '');
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              size="sm"
              aria-label="Filter by service"
              className="w-auto max-w-44"
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
              }}
            >
              <option value="">Any service</option>
              {serviceList.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </NativeSelect>
          </>
        }
        // The raw box, not the debounced needle: a view saves what was typed,
        // and applying one puts it back in the box for the debounce to pick up.
        views={{
          target: '/scheduling/waitlist',
          params: { q: search.trim(), status, service: serviceId },
          onApply: (next) => {
            setSearch(next.q ?? '');
            setStatus((next.status ?? '') as WaitlistStatus | '');
            setServiceId(next.service ?? '');
          },
        }}
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      {/* ONE card around the whole conditional — loading, failure, empty and the
          table all fill the same content region, so the pane never jumps. */}
      <Card className="min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <PaneLoadError
            module={MODULE}
            icon={<Icon glyph={faHourglass} className="size-6" aria-hidden />}
            title="Could not load the waiting list"
            description="Something went wrong reaching the server. Nobody has lost their place — the list just could not be read just now."
            onRetry={() => {
              void refetch();
            }}
          />
        ) : isLoading ? (
          <PaneWaiting module={MODULE} />
        ) : rows.length === 0 ? (
          <ListEmptyState
            module={MODULE}
            filtered={narrowed}
            noResults={{
              icon: <Icon glyph={faHourglass} className="size-6" aria-hidden />,
              title: 'No one matches that',
              description: 'Try a different search, or widen the filters above.',
            }}
            firstRun={{
              title: 'No one is waiting',
              description:
                'When a time someone wants is already full, add them here. The moment a matching slot frees up, you can offer it to them before it goes to waste.',
              actions: (
                <Button
                  color="module"
                  size="sm"
                  onClick={() => {
                    setAdding(true);
                  }}
                >
                  <Icon glyph={faPlus} className="size-4" aria-hidden />
                  Add someone
                </Button>
              ),
            }}
          />
        ) : (
          <Table size="sm" hover>
            <thead>
              <tr>
                <th>Who is waiting</th>
                <th className="hidden @xl:table-cell">For</th>
                <th className="hidden @2xl:table-cell">Window they would take</th>
                <th className="hidden @4xl:table-cell">Waiting since</th>
                <th>State</th>
                <th className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <WaitlistRow key={entry.id} ctx={ctx} entry={entry} />
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {rows.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-3 px-1">
          <p className="text-sm">
            {total === undefined
              ? `Showing ${String(from)}–${String(to)}`
              : `Showing ${String(from)}–${String(to)} of ${String(total)}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              disabled={!canPrev}
              onClick={() => {
                setPage((current) => Math.max(0, current - 1));
              }}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              color="neutral"
              disabled={!canNext}
              onClick={() => {
                setPage((current) => current + 1);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <AddToWaitlistModal
        open={adding}
        services={serviceList}
        defaultServiceId={serviceId}
        onClose={() => {
          setAdding(false);
        }}
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ONE ENTRY, WITH ITS ACTIONS
   ══════════════════════════════════════════════════════════════════════════ */

function WaitlistRow({ ctx, entry }: { ctx: SurfaceContext; entry: WaitlistEntry }) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const offer = useOfferWaitlist(entry.id);
  const accept = useAcceptWaitlist(entry.id);
  const remove = useRemoveWaitlist(entry.id);

  const [booking, setBooking] = useState(false);
  const [startLocal, setStartLocal] = useState('');

  const meta = waitlistStateMeta(entry.status);
  const active = entry.status === 'waiting' || entry.status === 'offered';

  const startIso = fromLocalInputValue(startLocal);
  const withinWindow =
    startIso !== null && startIso >= entry.desiredFrom && startIso <= entry.desiredTo;

  const onOffer = async () => {
    const ok = await confirmDialog({
      title: `Offer a slot to ${entry.customerName}?`,
      description: `They will be emailed that a spot for ${entry.serviceName ?? 'this service'} has opened up, and have ${String(OFFER_TTL_MINUTES)} minutes to take it before it passes to the next person waiting.`,
      confirmLabel: 'Send the offer',
      cancelLabel: 'Not yet',
      color: 'module',
    });
    if (!ok) return;
    offer.mutate(
      { offerTtlMinutes: OFFER_TTL_MINUTES },
      {
        onSuccess: () => {
          toast.add({ title: `Offer sent to ${entry.customerName}`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not send the offer',
            description: schedulingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onRemove = async () => {
    const ok = await confirmDialog({
      title: `Take ${entry.customerName} off the list?`,
      description: `They will no longer be offered a freed slot for ${entry.serviceName ?? 'this service'}. You can add them again later.`,
      confirmLabel: 'Remove them',
      cancelLabel: 'Keep them',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.add({ title: `${entry.customerName} removed`, type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not remove them',
          description: schedulingErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  const doBook = () => {
    if (!startIso || !withinWindow) return;
    accept.mutate(
      { startAt: startIso, resourceIds: [] },
      {
        onSuccess: (result) => {
          setBooking(false);
          // Land the operator on the booking this just created — it is a durable,
          // addressable thing, so it belongs in a pane, not a toast.
          ctx.open('scheduling.bookings.detail', { id: result.bookingId }, { target: 'beside' });
          afterPaneChange(() => {
            toast.add({ title: `${entry.customerName} booked in`, type: 'success' });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  const bookError = accept.isError
    ? schedulingErrorMessage(
        accept.error,
        'Could not book that time. It may have just been taken — try another within their window.'
      )
    : null;

  return (
    <>
      <tr>
        <td className="align-top">
          <div className="font-medium">{entry.customerName}</div>
          {entry.customerEmail ? <div className="text-sm">{entry.customerEmail}</div> : null}
          {/* On narrow panes the Service column is hidden — keep the service on the
              row so the entry is never ambiguous. */}
          <div className="text-sm @xl:hidden">{entry.serviceName ?? 'A service'}</div>
        </td>
        <td className="hidden align-top @xl:table-cell">{entry.serviceName ?? 'A service'}</td>
        <td className="hidden align-top text-sm @2xl:table-cell">
          <div>{formatWhen(entry.desiredFrom)}</div>
          <div>to {formatWhen(entry.desiredTo)}</div>
          {entry.status === 'offered' && entry.offerExpiresAt ? (
            <div>Offer open until {formatWhen(entry.offerExpiresAt)}</div>
          ) : null}
        </td>
        <td className="hidden align-top text-sm @4xl:table-cell">{formatDay(entry.createdAt)}</td>
        <td className="align-top">
          <Badge color={meta.tone} variant="soft" size="sm">
            {meta.label}
          </Badge>
        </td>
        <td className="text-right align-top">
          {active ? (
            <div className="inline-flex flex-wrap items-center justify-end gap-2">
              {entry.status === 'waiting' ? (
                <Button
                  size="sm"
                  variant="outline"
                  color="module"
                  loading={offer.isPending}
                  onClick={() => {
                    void onOffer();
                  }}
                >
                  <Icon glyph={faPaperPlane} className="size-4" aria-hidden />
                  Offer a slot
                </Button>
              ) : null}
              {entry.status === 'offered' ? (
                <Button
                  size="sm"
                  color="module"
                  onClick={() => {
                    setStartLocal((current) => current || toLocalInputValue(entry.desiredFrom));
                    setBooking((open) => !open);
                  }}
                >
                  <Icon glyph={faCalendarPlus} className="size-4" aria-hidden />
                  Book them in
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                aria-label={`Take ${entry.customerName} off the waiting list`}
                disabled={remove.isPending}
                onClick={() => {
                  void onRemove();
                }}
              >
                <Icon glyph={faUserMinus} className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}
        </td>
      </tr>

      {booking ? (
        <tr>
          <td colSpan={6} className="bg-base-200">
            <div className="flex flex-col gap-3 p-1">
              {bookError ? (
                <Alert color="error">
                  <AlertContent>
                    <AlertDescription>{bookError}</AlertDescription>
                  </AlertContent>
                </Alert>
              ) : null}
              <div className="flex flex-wrap items-end gap-3">
                <Field className="min-w-0">
                  <FieldLabel>Book {entry.customerName} in at</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        color="module"
                        type="datetime-local"
                        className="max-w-xs"
                        min={toLocalInputValue(entry.desiredFrom)}
                        max={toLocalInputValue(entry.desiredTo)}
                        value={startLocal}
                        onChange={(event) => {
                          setStartLocal(event.target.value);
                        }}
                      />
                    }
                  />
                  <FieldDescription>
                    A time inside the window they asked for. The booking is checked for a clash
                    before it takes.
                  </FieldDescription>
                </Field>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    color="module"
                    disabled={!withinWindow || accept.isPending}
                    loading={accept.isPending}
                    onClick={doBook}
                  >
                    Confirm booking
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    onClick={() => {
                      setBooking(false);
                    }}
                  >
                    <Icon glyph={faXmark} className="size-4" aria-hidden />
                    Cancel
                  </Button>
                </div>
              </div>
              {startIso !== null && !withinWindow ? (
                <Text className="text-sm">That time is outside the window they asked for.</Text>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ADD SOMEONE — the modal
   ══════════════════════════════════════════════════════════════════════════ */

function AddToWaitlistModal({
  open,
  services,
  defaultServiceId,
  onClose,
}: {
  open: boolean;
  services: { id: string; name: string }[];
  defaultServiceId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const create = useCreateWaitlistEntry();
  const formId = useId();

  const [serviceId, setServiceId] = useState(defaultServiceId);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [fromLocal, setFromLocal] = useState('');
  const [toLocal, setToLocal] = useState('');

  // Start clean each time it opens — a mistaken dismissal reopens to a blank form,
  // not last time's half-filled one.
  useEffect(() => {
    if (!open) return;
    setServiceId(defaultServiceId);
    setCustomer(null);
    setFromLocal('');
    setToLocal('');
  }, [open, defaultServiceId]);

  const fromIso = fromLocalInputValue(fromLocal);
  const toIso = fromLocalInputValue(toLocal);
  const windowOk = fromIso !== null && toIso !== null && fromIso < toIso;
  const canSave = serviceId !== '' && customer !== null && windowOk && !create.isPending;

  const saveError = create.isError
    ? schedulingErrorMessage(create.error, 'Could not add them. Check the details and try again.')
    : null;

  const submit = () => {
    if (!canSave || !customer || !fromIso || !toIso) return;
    create.mutate(
      {
        serviceId,
        customerId: customer.id,
        desiredFrom: fromIso,
        desiredTo: toIso,
      },
      {
        onSuccess: () => {
          onClose();
          afterPaneChange(() => {
            toast.add({
              title: 'Added to the waiting list',
              description: 'They will be in line for the next matching slot that frees up.',
              type: 'success',
            });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  return (
    <PaneScope>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        {/* `@container` is load-bearing: a PaneScope'd dialog portals to the
            pane HOST, which sits outside the `@container` on PANE_SHELL, so the
            two-column form below matched nothing and every field stacked. */}
        <DialogContent className="@container flex max-h-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden">
          <DialogTitle>Add someone to the waiting list</DialogTitle>

          <form
            id={formId}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <SaveFailure title="Could not add them" message={saveError} />

            <Field>
              <FieldLabel>For which service</FieldLabel>
              <NativeSelect
                color="module"
                aria-label="Which service they are waiting for"
                value={serviceId}
                onChange={(event) => {
                  setServiceId(event.target.value);
                }}
              >
                <option value="">Choose a service…</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel>Who is waiting</FieldLabel>
              <CustomerPicker value={customer} onChange={setCustomer} />
            </Field>

            <div className="grid gap-4 @md:grid-cols-2">
              <Field>
                <FieldLabel>Earliest they would take</FieldLabel>
                <Input
                  color="module"
                  type="datetime-local"
                  value={fromLocal}
                  onChange={(event) => {
                    setFromLocal(event.target.value);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel>Latest they would take</FieldLabel>
                <Input
                  color="module"
                  type="datetime-local"
                  value={toLocal}
                  onChange={(event) => {
                    setToLocal(event.target.value);
                  }}
                />
              </Field>
            </div>
            {fromIso !== null && toIso !== null && !windowOk ? (
              <Text className="text-sm">The latest time needs to be after the earliest.</Text>
            ) : (
              <Text className="text-sm">
                The window they would accept a slot in. They are offered anything that frees up
                between these two times.
              </Text>
            )}
          </form>

          <DialogFooter>
            <Button color="neutral" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={formId} color="module" size="sm" disabled={!canSave}>
              {create.isPending ? 'Adding…' : 'Add to waiting list'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}

export default WaitlistSurface;
