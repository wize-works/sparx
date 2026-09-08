'use client';

// ONE BOOKING — take a new one, then manage it through its life.
//
// ── Create and manage are the SAME surface ───────────────────────────────
//
// A new booking and an existing one are the same appointment at two ages, so
// this is ONE pane in two states: `{id:'new'}` is the form that takes a booking,
// `{id}` is the record it becomes — the same pane, replaced in place after the
// create. The two states show different controls because a booking's shape
// changes once it exists: you no longer re-pick its service, you move it in time,
// confirm it, and see it through. This mirrors the sites create-and-manage pane.
//
// ── Lifecycle is the header's job ────────────────────────────────────────
//
// Advancing a booking (confirm → check in → complete) is its position and its
// moves, so those live in the toolbar. The outcomes nobody wants — a no-show, a
// cancellation — are rare and hard to undo, so they sit quietly at the bottom
// under a divider rather than as buttons competing with the everyday ones.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import {
  CalendarClock,
  CalendarX2,
  CheckCheck,
  CircleCheck,
  LogIn,
  Save,
  UserX,
} from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { BookingTimeline } from './booking-timeline';
import { CustomerPicker } from './bookings-customer-picker';
import { SaveFailure } from '@/components/save-failure';
import {
  bookingResourceLabel,
  bookingStateMeta,
  bookingTypeLabel,
  customerName,
  formatMoney,
  formatWhen,
  fromLocalInputValue,
  isNotFound,
  isTerminalBooking,
  localTimezone,
  schedulingErrorMessage,
  toLocalInputValue,
  useBooking,
  useCancelBooking,
  useCheckInBooking,
  useCompleteBooking,
  useConfirmBooking,
  useCreateBooking,
  useCustomer,
  useNoShowBooking,
  useRescheduleBooking,
  useSchedulingResources,
  useSchedulingServices,
  useUpdateBooking,
  type Booking,
  type CustomerLite,
  type ServiceLite,
} from './bookings-data';
import { PaneLoadError } from '../../components/pane-load-error';

/** Centred and capped — a pane torn onto a second monitor is 2000px wide, and
 *  uncapped this becomes fields pinned to the far-left edge. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/* ══════════════════════════════════════════════════════════════════════════
   TAKE A NEW BOOKING
   ══════════════════════════════════════════════════════════════════════════ */

function BookingCreate({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const create = useCreateBooking();
  const services = useSchedulingServices('');
  const resources = useSchedulingResources();

  const [serviceId, setServiceId] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [partySize, setPartySize] = useState('');
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    ctx.setTitle('New booking');
  }, [ctx]);

  const serviceList = services.data?.items ?? [];
  const chosenService = serviceList.find((s) => s.id === serviceId) ?? null;
  const resourceList = resources.data ?? [];

  const startIso = fromLocalInputValue(startLocal);
  const changed =
    serviceId !== '' ||
    startLocal !== '' ||
    customer !== null ||
    partySize !== '' ||
    resourceIds.length > 0 ||
    notes.trim() !== '';
  const canSave = serviceId !== '' && startIso !== null && !create.isPending && !create.isSuccess;

  useDirtySource(
    changed && !create.isSuccess,
    'This booking has not been taken yet. Close anyway?'
  );

  const toggleResource = (id: string) => {
    setResourceIds((current) =>
      current.includes(id) ? current.filter((r) => r !== id) : [...current, id]
    );
  };

  const saveError = create.isError
    ? schedulingErrorMessage(
        create.error,
        'Nothing was booked. That time may have just been taken — try another.'
      )
    : null;

  const submit = () => {
    if (!canSave || !startIso) return;
    const size = Number.parseInt(partySize, 10);
    create.mutate(
      {
        serviceId,
        startAt: startIso,
        timezone: localTimezone(),
        ...(customer ? { customerId: customer.id } : {}),
        ...(Number.isFinite(size) && size > 1 ? { partySize: size } : {}),
        resourceIds,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        source: 'dashboard',
      },
      {
        onSuccess: (booking) => {
          // Becomes the manage view for the booking that now exists, rather than a
          // spent form. Toast follows the swap — see afterPaneChange.
          ctx.open('scheduling.bookings.detail', { id: booking.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: 'Booking taken', type: 'success' });
          });
        },
      }
    );
  };

  const noServices = services.isSuccess && serviceList.length === 0;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New booking actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            disabled={!canSave}
            loading={create.isPending}
            onClick={submit}
          >
            <Save className="size-4" aria-hidden />
            Take booking
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <SaveFailure title="Could not take this booking" message={saveError} />

          {noServices ? (
            <Alert color="info">
              <AlertContent>
                <AlertTitle>Set up something to book first</AlertTitle>
                <AlertDescription>
                  A booking is a time against one of your services. Add a service — what people can
                  book you for, and how long it takes — and it will appear here to choose.
                </AlertDescription>
              </AlertContent>
              <Button
                size="sm"
                color="info"
                variant="soft"
                onClick={() => {
                  ctx.open('scheduling.services.list');
                }}
              >
                Set up a service
              </Button>
            </Alert>
          ) : null}

          <FormSection
            title="What and when"
            description="Pick what is being booked and the time it starts. The finish time is worked out from how long the service takes."
          >
            <Field>
              <FieldLabel>What is being booked</FieldLabel>
              <FieldControl
                render={
                  <NativeSelect
                    color="module"
                    aria-label="What is being booked"
                    value={serviceId}
                    disabled={services.isLoading || noServices}
                    onChange={(event) => {
                      setServiceId(event.target.value);
                    }}
                  >
                    <option value="">Choose a service…</option>
                    {serviceList.map((service) => (
                      <option key={service.id} value={service.id}>
                        {serviceLabel(service)}
                      </option>
                    ))}
                  </NativeSelect>
                }
              />
              {chosenService ? (
                <FieldDescription>
                  {bookingTypeLabel(chosenService.bookingType)} · {chosenService.durationMinutes}{' '}
                  minutes
                  {chosenService.priceCents > 0
                    ? ` · ${formatMoney(chosenService.priceCents, chosenService.currency)}`
                    : ''}
                </FieldDescription>
              ) : (
                <FieldDescription>The service this time is set aside for.</FieldDescription>
              )}
            </Field>

            <Field>
              <FieldLabel>Starts</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="datetime-local"
                    className="max-w-xs"
                    value={startLocal}
                    onChange={(event) => {
                      setStartLocal(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                The day and time it begins, in your own time zone.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Who it is for"
            description="Link the customer this is booked for, so it shows on their record and their reminders reach them. Leave it blank for a booking with no account — a walk-in you are writing down."
          >
            <CustomerPicker value={customer} onChange={setCustomer} />

            <Field>
              <FieldLabel>How many people (optional)</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    type="number"
                    min={1}
                    className="max-w-32"
                    value={partySize}
                    placeholder="1"
                    onChange={(event) => {
                      setPartySize(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                For a table or a group — how many are coming. Leave blank for one.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection
            title="Who or what it is with"
            description="Pin this to particular people or equipment if it matters. Choose none and whoever is free at that time is assigned for you."
          >
            {resources.isLoading ? (
              <Text className="text-sm" role="status">
                Loading…
              </Text>
            ) : resourceList.length === 0 ? (
              <Text className="text-sm">
                You have not set up any people or equipment yet, so this will be assigned
                automatically.
              </Text>
            ) : (
              <div className="border-base-300 flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border p-1">
                {resourceList.map((resource) => {
                  const on = resourceIds.includes(resource.id);
                  return (
                    <label
                      key={resource.id}
                      className="hover:bg-base-200 flex cursor-pointer items-center gap-3 rounded px-2 py-2"
                    >
                      <Checkbox
                        color="module"
                        size="sm"
                        checked={on}
                        aria-label={`Assign ${resource.name}`}
                        onChange={() => {
                          toggleResource(resource.id);
                        }}
                      />
                      <span className="min-w-0 flex-1 font-medium">{resource.name}</span>
                      <Text as="span" className="shrink-0 text-sm capitalize">
                        {resource.kind}
                      </Text>
                    </label>
                  );
                })}
              </div>
            )}
          </FormSection>

          <FormSection
            title="A note (optional)"
            description="Anything the customer should see about this booking — where to park, what to bring."
          >
            <Textarea
              color="module"
              rows={3}
              value={notes}
              placeholder="Please arrive five minutes early."
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          </FormSection>
        </div>
      </div>
    </div>
  );
}

function serviceLabel(service: ServiceLite): string {
  return service.name;
}

/* ══════════════════════════════════════════════════════════════════════════
   MANAGE AN EXISTING BOOKING
   ══════════════════════════════════════════════════════════════════════════ */

function BookingManage({ ctx, booking }: { ctx: SurfaceContext; booking: Booking }) {
  const toast = useToast();
  const confirmDialog = useConfirm();
  const id = booking.id;

  const update = useUpdateBooking(id);
  const confirm = useConfirmBooking(id);
  const checkIn = useCheckInBooking(id);
  const complete = useCompleteBooking(id);
  const noShow = useNoShowBooking(id);
  const cancel = useCancelBooking(id);
  const reschedule = useRescheduleBooking(id);

  const bookedCustomer = useCustomer(booking.customerId);

  const [notes, setNotes] = useState(booking.notes ?? '');
  const [staffNotes, setStaffNotes] = useState(booking.staffNotes ?? '');
  const [rescheduleLocal, setRescheduleLocal] = useState(toLocalInputValue(booking.startAt));

  const meta = bookingStateMeta(booking.status);
  const terminal = isTerminalBooking(booking.status);

  useEffect(() => {
    ctx.setTitle(booking.service.name || 'Booking');
  }, [ctx, booking.service.name]);

  const notesChanged = notes !== (booking.notes ?? '') || staffNotes !== (booking.staffNotes ?? '');
  useDirtySource(notesChanged, 'This booking has unsaved notes. Close anyway?');

  const rescheduleIso = fromLocalInputValue(rescheduleLocal);
  const rescheduleMoved = rescheduleIso !== null && rescheduleIso !== booking.startAt;

  // ONE message, the most specific one — the latest action that failed.
  const actionError = useMemo(() => {
    const failed = [confirm, checkIn, complete, noShow, cancel, reschedule].find((m) => m.isError);
    if (!failed) return null;
    return schedulingErrorMessage(failed.error, 'That did not go through. Nothing was changed.');
  }, [confirm, checkIn, complete, noShow, cancel, reschedule]);

  const who = booking.attendees.find((a) => a.guestName?.trim())?.guestName
    ? booking.attendees.find((a) => a.guestName?.trim())?.guestName
    : booking.customerId
      ? customerName(bookedCustomer.data)
      : null;

  const saveNotes = () => {
    if (!notesChanged) return;
    update.mutate(
      {
        notes: notes.trim() ? notes.trim() : null,
        staffNotes: staffNotes.trim() ? staffNotes.trim() : null,
      },
      {
        onSuccess: () => {
          toast.add({ title: 'Notes saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save the notes',
            description: schedulingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const doReschedule = () => {
    if (!rescheduleIso || !rescheduleMoved) return;
    reschedule.mutate(
      { startAt: rescheduleIso, resourceIds: [], notifyCustomer: true },
      {
        onSuccess: () => {
          toast.add({ title: 'Booking moved', type: 'success' });
        },
      }
    );
  };

  const onCancel = async () => {
    const ok = await confirmDialog({
      title: `Cancel ${booking.service.name}?`,
      description: `This releases the ${formatWhen(booking.startAt, booking.timezone)} slot so someone else can take it, and lets the customer know. Any deposit is handled by your booking rules. This cannot be undone.`,
      confirmLabel: 'Cancel this booking',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    cancel.mutate(
      { reason: null, waiveFee: false, notifyCustomer: true },
      {
        onSuccess: () => {
          toast.add({ title: 'Booking cancelled', type: 'success' });
        },
      }
    );
  };

  const onNoShow = async () => {
    const ok = await confirmDialog({
      title: 'Mark as a no-show?',
      description: `This records that the customer did not turn up for the ${formatWhen(booking.startAt, booking.timezone)} booking and frees the slot. Any no-show fee in your booking rules is applied.`,
      confirmLabel: 'They did not turn up',
      cancelLabel: 'Back',
      color: 'danger',
    });
    if (!ok) return;
    noShow.mutate(
      { waiveFee: false },
      {
        onSuccess: () => {
          toast.add({ title: 'Marked as a no-show', type: 'success' });
        },
      }
    );
  };

  const lifecycleBusy =
    confirm.isPending || checkIn.isPending || complete.isPending || reschedule.isPending;

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Booking actions"
        controls={
          <>
            <Badge color={meta.tone} variant="soft" size="sm">
              {meta.label}
            </Badge>
            {booking.status === 'requested' ? (
              <Button
                color="module"
                size="sm"
                className="ml-auto"
                loading={confirm.isPending}
                disabled={lifecycleBusy}
                onClick={() => {
                  confirm.mutate(undefined, {
                    onSuccess: () => {
                      toast.add({ title: 'Booking confirmed', type: 'success' });
                    },
                  });
                }}
              >
                <CircleCheck className="size-4" aria-hidden />
                Confirm
              </Button>
            ) : null}
            {booking.status === 'confirmed' ? (
              <Button
                color="module"
                size="sm"
                className="ml-auto"
                loading={checkIn.isPending}
                disabled={lifecycleBusy}
                onClick={() => {
                  checkIn.mutate(undefined, {
                    onSuccess: () => {
                      toast.add({ title: 'Checked in', type: 'success' });
                    },
                  });
                }}
              >
                <LogIn className="size-4" aria-hidden />
                Check in
              </Button>
            ) : null}
            {booking.status === 'confirmed' || booking.status === 'in_progress' ? (
              <Button
                color="success"
                variant={booking.status === 'in_progress' ? 'solid' : 'outline'}
                size="sm"
                className={booking.status === 'in_progress' ? 'ml-auto' : undefined}
                loading={complete.isPending}
                disabled={lifecycleBusy}
                onClick={() => {
                  complete.mutate(undefined, {
                    onSuccess: () => {
                      toast.add({ title: 'Booking completed', type: 'success' });
                    },
                  });
                }}
              >
                <CheckCheck className="size-4" aria-hidden />
                Complete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* Identity: the pane opens by saying WHAT this is — the service, when it
              is, and who it is with. */}
          <div className="flex flex-col gap-1">
            <Heading level={1} className="flex min-w-0 items-center gap-2 text-2xl font-semibold">
              <CalendarClock className="size-5 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{booking.service.name}</span>
            </Heading>
            <Text className="text-base">
              {bookingTypeLabel(booking.bookingType)} ·{' '}
              {formatWhen(booking.startAt, booking.timezone)}
            </Text>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>With {bookingResourceLabel(booking)}</span>
              {who ? (
                <>
                  <span aria-hidden>·</span>
                  <span>For {who}</span>
                </>
              ) : null}
            </div>
          </div>

          <SaveFailure title="That did not go through" message={actionError} />

          {/* Moving the booking in time. Hidden once it is over — a completed or
              cancelled booking does not move. */}
          {!terminal ? (
            <FormSection
              title="Move it"
              description="Change when this happens. The new time is checked for a clash before it takes, and the customer is told."
            >
              <div className="flex flex-wrap items-end gap-3">
                <Field className="min-w-0">
                  <FieldLabel>New start</FieldLabel>
                  <FieldControl
                    render={
                      <Input
                        color="module"
                        type="datetime-local"
                        className="max-w-xs"
                        value={rescheduleLocal}
                        onChange={(event) => {
                          setRescheduleLocal(event.target.value);
                        }}
                      />
                    }
                  />
                </Field>
                <Button
                  size="sm"
                  variant="outline"
                  color="module"
                  disabled={!rescheduleMoved || reschedule.isPending}
                  loading={reschedule.isPending}
                  onClick={doReschedule}
                >
                  <CalendarClock className="size-4" aria-hidden />
                  Move booking
                </Button>
              </div>
            </FormSection>
          ) : null}

          <FormSection
            title="Notes"
            description="What the customer sees, and a private note just for your team."
            action={
              <Button
                size="sm"
                color="module"
                disabled={!notesChanged || update.isPending}
                loading={update.isPending}
                onClick={saveNotes}
              >
                <Save className="size-4" aria-hidden />
                Save
              </Button>
            }
          >
            <Field>
              <FieldLabel>The customer sees</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={notes}
                    placeholder="Please arrive five minutes early."
                    onChange={(event) => {
                      setNotes(event.target.value);
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>Private note for your team</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={3}
                    value={staffNotes}
                    placeholder="Regular — prefers the bay by the window."
                    onChange={(event) => {
                      setStaffNotes(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>The customer never sees this.</FieldDescription>
            </Field>
          </FormSection>

          {/* The change history — what has happened to this booking, and the old
              values its own row no longer keeps (the time it moved from, the note
              that was replaced). Read-only, newest first. */}
          <FormSection
            title="History"
            description="Everything that has happened to this booking, most recent first."
          >
            <BookingTimeline bookingId={id} timezone={booking.timezone} />
          </FormSection>

          {/* Rare, hard-to-undo outcomes. Kept apart from the everyday actions,
              after the work, under a divider — not a button competing with Save. */}
          {!terminal ? (
            <div className="border-base-300 flex flex-col gap-4 border-t pt-4">
              {booking.status === 'requested' || booking.status === 'confirmed' ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Text className="text-sm">
                    They did not turn up. This frees the slot and applies any no-show fee from your
                    booking rules.
                  </Text>
                  <Button
                    size="sm"
                    variant="outline"
                    color="danger"
                    disabled={noShow.isPending}
                    onClick={() => {
                      void onNoShow();
                    }}
                  >
                    <UserX className="size-4" aria-hidden />
                    Mark no-show
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Text className="text-sm">
                  Cancelling releases the slot and lets the customer know. It cannot be undone.
                </Text>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  disabled={cancel.isPending}
                  onClick={() => {
                    void onCancel();
                  }}
                >
                  <CalendarX2 className="size-4" aria-hidden />
                  Cancel booking
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PANE
   ══════════════════════════════════════════════════════════════════════════ */

export function BookingDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  const booking = useBooking(id);

  if (id === 'new') {
    return <BookingCreate ctx={ctx} />;
  }

  // A failed load REPLACES the record — never a live form beside a dead action.
  if (booking.isError) {
    const gone = isNotFound(booking.error);
    return (
      <div className={PANE_SHELL}>
        <PaneLoadError
          reason={gone ? 'missing' : 'unreachable'}
          title={gone ? 'This booking no longer exists' : 'Could not load this booking'}
          description={
            gone
              ? 'It may have been removed. Nothing else is affected.'
              : 'This is a problem reaching the server. Nothing about the booking has changed.'
          }
          onRetry={() => {
            void booking.refetch();
          }}
        />
      </div>
    );
  }

  if (booking.isPending || !booking.data) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-base" role="status">
          Loading…
        </p>
      </div>
    );
  }

  // `key` remounts the editor when the pane is pointed at a different booking, so
  // notes state re-seeds from the new row — the replace hop after create needs this.
  return <BookingManage key={booking.data.id} ctx={ctx} booking={booking.data} />;
}

export default BookingDetailSurface;
