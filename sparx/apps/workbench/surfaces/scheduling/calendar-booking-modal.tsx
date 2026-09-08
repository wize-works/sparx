'use client';

// ONE BOOKING, opened from the diary — a quick-look MODAL over the calendar.
//
// ── Why a modal, not a pane ───────────────────────────────────────────────
//
// Clicking a block on the calendar is the operator running the day, not editing
// a record. A pane would split or (on compact) fully take over the grid — the
// fifth "don't break their context" test rules a pane OUT here, because the whole
// point is to glance at a booking WITHOUT losing sight of the week around it. The
// modal floats over the diary, which stays live behind it.
//
// It holds NO server-uncommitted draft: every move — reschedule, confirm, check
// in, complete, cancel, no-show — is a direct mutation or a named confirm, so the
// app's unsaved-work safety net isn't bypassed (there is nothing to lose on
// abandon). The one thing that IS a durable place you return to — the full,
// editable booking with its notes and parts — stays a pane, reached from the
// "Open full booking" button here.
//
// ── Structure ─────────────────────────────────────────────────────────────
//
// Deliberately the SAME shape as the full booking pane (bookings-detail.tsx), so
// the two never read as different features: a header that states identity + when +
// who + status; then grouped `FormSection`s for the substantive parts (Move it,
// Change history). Actions fall into four consistent roles, each in one place —
// the primary lifecycle step (module, solid), Move (module, outline, exactly as
// the pane), the two destructive moves (ghost, semantic — kept apart at the
// bottom), and the footer's dismiss + hand-off. No ad-hoc dividers, no button zoo.
//
// Every move refreshes the diary the moment it lands (the calendar mutations
// invalidate the range), so the block on the grid behind the modal is never
// stale, and the modal's own read re-reflects the new time.

import { useEffect, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Field,
  FieldControl,
  FieldLabel,
  Heading,
  Input,
  Text,
} from '@wizeworks/silicaui-react';
import { ArrowUpRight, CalendarClock, Check, CircleCheck, LogIn, UserX, X } from 'lucide-react';
// The pane's imperative-confirm wrapper — the app standardised on this over the
// raw silica hook (it yields the flushSync commit before returning).
import { useConfirm } from '../../lib/confirm';
import { PaneScope } from '../../lib/dock/window-boundary';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { BookingTimeline } from './booking-timeline';
import { SaveFailure } from '@/components/save-failure';
import {
  bookingResourceLabel,
  bookingStateMeta,
  bookingTypeLabel,
  customerName,
  formatClock,
  formatWhen,
  fromLocalInputValue,
  isTerminalBooking,
  toLocalInputValue,
  useBooking,
  useCustomer,
  type Booking,
} from './bookings-data';
import {
  calendarErrorMessage,
  useCancel,
  useCheckIn,
  useComplete,
  useConfirm as useConfirmBooking,
  useNoShow,
  useReschedule,
} from './calendar-data';

interface CalendarBookingModalProps {
  /** The booking to show, or null when nothing is selected (modal closed). */
  bookingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: SurfaceContext;
}

/** A labelled group inside the modal.
 *
 *  The full pane groups with `FormSection`, whose `card bg-base-100` box lifts off
 *  the pane's recessed `base-200` shell. A dialog is itself `base-100`, so that same
 *  card lands box-on-box — card-in-card, the patchwork look. This is the flat
 *  equivalent: the SAME heading rank and underline rhythm the pane uses (so the two
 *  still read as one feature), minus the box, matching the gold-standard modal's
 *  flat sections. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="border-base-300 flex flex-col gap-0.5 border-b pb-2">
        <Heading level={2} className="text-lg font-semibold">
          {title}
        </Heading>
        {description ? <Text className="text-sm">{description}</Text> : null}
      </div>
      {children}
    </section>
  );
}

/** A booking's length in plain words, e.g. "45 min" or "1 hr 30 min". */
function durationLabel(booking: Booking): string {
  const minutes = Math.round(
    (new Date(booking.endAt).getTime() - new Date(booking.startAt).getTime()) / 60000
  );
  if (minutes <= 0) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${String(rest)} min`;
  if (rest === 0) return `${String(hours)} hr`;
  return `${String(hours)} hr ${String(rest)} min`;
}

export function CalendarBookingModal({
  bookingId,
  open,
  onOpenChange,
  ctx,
}: CalendarBookingModalProps) {
  return (
    // PaneScope confines the backdrop to the calendar pane, so in a multi-pane
    // layout opening a booking dims THIS diary, not the whole app.
    <PaneScope>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onOpenChange(false);
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden">
          {bookingId ? (
            <ModalBody bookingId={bookingId} ctx={ctx} onClose={() => onOpenChange(false)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}

function ModalBody({
  bookingId,
  ctx,
  onClose,
}: {
  bookingId: string;
  ctx: SurfaceContext;
  onClose: () => void;
}) {
  const { data: booking, isPending, isError, refetch } = useBooking(bookingId);

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        <DialogTitle className="text-xl font-semibold">Booking</DialogTitle>
        <Alert color="error">
          <AlertContent>
            <AlertTitle>Could not load this booking</AlertTitle>
            <AlertDescription>
              This is a problem reaching the server, or the booking no longer exists. Your diary is
              unaffected.
            </AlertDescription>
          </AlertContent>
          <Button
            size="sm"
            color="error"
            variant="soft"
            onClick={() => {
              void refetch();
            }}
          >
            Try again
          </Button>
        </Alert>
      </div>
    );
  }

  if (isPending || !booking) {
    return (
      <div className="flex flex-col gap-4">
        <DialogTitle className="text-xl font-semibold">Booking</DialogTitle>
        <Text className="text-base" role="status">
          Loading…
        </Text>
      </div>
    );
  }

  return <LoadedModal booking={booking} ctx={ctx} onClose={onClose} />;
}

function LoadedModal({
  booking,
  ctx,
  onClose,
}: {
  booking: Booking;
  ctx: SurfaceContext;
  onClose: () => void;
}) {
  const id = booking.id;
  const confirmDialog = useConfirm();
  const { data: customer } = useCustomer(booking.customerId);

  const confirm = useConfirmBooking(id);
  const checkIn = useCheckIn(id);
  const complete = useComplete(id);
  const noShow = useNoShow(id);
  const cancel = useCancel(id);
  const reschedule = useReschedule(id);

  // The pending new time. Re-seeds from the booking whenever its start moves, so
  // after a successful reschedule the field shows the time it now sits at.
  const [when, setWhen] = useState(() => toLocalInputValue(booking.startAt));
  useEffect(() => {
    setWhen(toLocalInputValue(booking.startAt));
  }, [booking.startAt]);

  const state = bookingStateMeta(booking.status);
  const terminal = isTerminalBooking(booking.status);
  const canConfirm = booking.status === 'requested' || booking.status === 'waitlisted';
  const canCheckIn = booking.status === 'confirmed';
  const canComplete = booking.status === 'in_progress';
  const canNoShow = booking.status === 'confirmed' || booking.status === 'in_progress';
  const canCancel = !terminal;
  const canReschedule = booking.status === 'requested' || booking.status === 'confirmed';
  const duration = durationLabel(booking);

  const movedTo = fromLocalInputValue(when);
  const canMove = movedTo !== null && movedTo !== booking.startAt && !reschedule.isPending;

  const anyPending =
    confirm.isPending ||
    checkIn.isPending ||
    complete.isPending ||
    noShow.isPending ||
    cancel.isPending ||
    reschedule.isPending;

  // ONE message, the most specific one — the latest action that was refused,
  // named verbatim by the server (a clash, a closed hour).
  const failed = [confirm, checkIn, complete, noShow, cancel, reschedule].find((m) => m.isError);
  const actionError = failed
    ? calendarErrorMessage(failed.error, 'That did not go through. Nothing was changed.')
    : null;

  const who = booking.customerId ? customerName(customer) : null;
  const facts = [
    bookingTypeLabel(booking.bookingType),
    `With ${bookingResourceLabel(booking)}`,
    ...(who ? [`For ${who}`] : []),
  ].join(' · ');

  const onConfirm = () => {
    confirm.mutate({});
  };
  const onCheckIn = () => {
    checkIn.mutate({});
  };
  const onComplete = () => {
    complete.mutate({});
  };
  const onMove = () => {
    if (!movedTo) return;
    reschedule.mutate({ startAt: movedTo });
  };

  const onCancel = async () => {
    const ok = await confirmDialog({
      title: `Cancel this ${bookingTypeLabel(booking.bookingType).toLowerCase()}?`,
      description: `${booking.service.name} at ${formatWhen(booking.startAt, booking.timezone)} will be cancelled and its slot freed for someone else. Any deposit is settled by your booking rules. This cannot be undone.`,
      confirmLabel: 'Cancel the booking',
      cancelLabel: 'Keep it',
      color: 'error',
    });
    if (!ok) return;
    cancel.mutate({});
  };

  const onNoShow = async () => {
    const ok = await confirmDialog({
      title: 'Mark as a no-show?',
      description: `This records that the customer did not turn up for ${booking.service.name} at ${formatWhen(booking.startAt, booking.timezone)}. Any no-show fee in your booking rules is applied, and the slot is freed.`,
      confirmLabel: 'Mark no-show',
      cancelLabel: 'Not yet',
      color: 'warning',
    });
    if (!ok) return;
    noShow.mutate({});
  };

  const openFullBooking = () => {
    // The deep, durable place — notes, parts, everything. Close the quick-look and
    // hand off to its own pane.
    onClose();
    ctx.open('scheduling.bookings.detail', { id });
  };

  return (
    <>
      {/* Header — identity, when, who, and where it stands. The same block the
          full pane opens with, so the two read as one feature. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle className="text-xl font-semibold break-words">
            {booking.service.name}
          </DialogTitle>
          <Text className="text-base">
            {formatWhen(booking.startAt, booking.timezone)} –{' '}
            {formatClock(booking.endAt, booking.timezone)}
            {duration ? ` · ${duration}` : ''}
          </Text>
          <Text className="text-sm break-words">{facts}</Text>
        </div>
        <Badge color={state.tone} variant="soft" size="sm" className="shrink-0">
          {state.label}
        </Badge>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2">
        <SaveFailure title="That did not go through" message={actionError} />

        {booking.status === 'cancelled' && booking.cancellationReason ? (
          <Alert color="error">
            <AlertContent>
              <AlertTitle>Cancelled</AlertTitle>
              <AlertDescription>{booking.cancellationReason}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        {/* The one primary next step for where this booking stands. Usually just
            one applies — a single, module-colored action, never a rainbow row. */}
        {canConfirm || canCheckIn || canComplete ? (
          <div className="flex flex-wrap gap-2">
            {canConfirm ? (
              <Button
                size="sm"
                color="module"
                loading={confirm.isPending}
                disabled={anyPending}
                onClick={onConfirm}
              >
                <Check className="size-4" aria-hidden />
                Confirm
              </Button>
            ) : null}
            {canCheckIn ? (
              <Button
                size="sm"
                color="module"
                loading={checkIn.isPending}
                disabled={anyPending}
                onClick={onCheckIn}
              >
                <LogIn className="size-4" aria-hidden />
                Check in
              </Button>
            ) : null}
            {canComplete ? (
              <Button
                size="sm"
                color="module"
                loading={complete.isPending}
                disabled={anyPending}
                onClick={onComplete}
              >
                <CircleCheck className="size-4" aria-hidden />
                Complete
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* Reschedule — the same "Move it" group the full pane uses, verbatim, so
            the interaction is identical wherever the operator meets it. */}
        {canReschedule ? (
          <Section
            title="Move it"
            description="Shown in your own time zone. A time that clashes or falls outside opening hours is refused, and nothing changes."
          >
            <div className="flex flex-wrap items-end gap-3">
              <Field className="min-w-0">
                <FieldLabel>New start</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      type="datetime-local"
                      color="module"
                      className="max-w-xs"
                      value={when}
                      onChange={(domEvent) => {
                        setWhen(domEvent.target.value);
                      }}
                    />
                  }
                />
              </Field>
              <Button
                size="sm"
                variant="outline"
                color="module"
                loading={reschedule.isPending}
                disabled={!canMove}
                onClick={onMove}
              >
                <CalendarClock className="size-4" aria-hidden />
                Move booking
              </Button>
            </div>
          </Section>
        ) : null}

        {/* Change history — the old versions the booking row no longer keeps. */}
        <Section title="Change history">
          <BookingTimeline bookingId={id} timezone={booking.timezone} />
        </Section>

        {/* The two hard-to-undo moves, kept apart at the bottom and quiet, so they
            never compete with the primary step above. */}
        {canNoShow || canCancel ? (
          <div className="flex flex-wrap gap-2">
            {canNoShow ? (
              <Button
                size="sm"
                variant="ghost"
                color="warning"
                loading={noShow.isPending}
                disabled={anyPending}
                onClick={() => {
                  void onNoShow();
                }}
              >
                <UserX className="size-4" aria-hidden />
                Mark no-show
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                size="sm"
                variant="ghost"
                color="danger"
                loading={cancel.isPending}
                disabled={anyPending}
                onClick={() => {
                  void onCancel();
                }}
              >
                <X className="size-4" aria-hidden />
                Cancel booking
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button color="neutral" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
        <Button color="module" variant="soft" size="sm" onClick={openFullBooking}>
          <ArrowUpRight className="size-4" aria-hidden />
          Open full booking
        </Button>
      </DialogFooter>
    </>
  );
}

export default CalendarBookingModal;
