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
// who + status; then grouped sections for the substantive parts (Move it, Change
// history). Actions fall into four consistent roles, each in one place — the
// primary lifecycle step (module, solid), Move (module, outline, exactly as the
// pane), the two destructive moves (ghost, semantic — kept apart at the bottom),
// and the footer's dismiss + hand-off. No ad-hoc dividers, no button zoo.
//
// This file owns the SHAPE. What a booking looks like is calendar-booking-parts,
// what can be done to it is calendar-booking-actions;
// what the modal knows and does is calendar-booking-state; the wording of the two
// confirms is booking-endings-copy, shared with the full pane so a fix to either
// question can never again land on only one of them (issue 142).
//
// Every move refreshes the diary the moment it lands (the calendar mutations
// invalidate the range), so the block on the grid behind the modal is never
// stale, and the modal's own read re-reflects the new time.

import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Text,
} from '@wizeworks/silicaui-react';
import { faArrowUpRight } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneScope } from '../../lib/dock/window-boundary';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { BookingTimeline } from './booking-timeline';
import { useBooking, type Booking } from './bookings-data';
import { useCalendarBooking } from './calendar-booking-state';
import { EndingsRow, LifecycleRow, MoveSection } from './calendar-booking-actions';
import { ModalHeader, Section } from './calendar-booking-parts';
import { SaveFailure } from '@/components/save-failure';

interface CalendarBookingModalProps {
  /** The booking to show, or null when nothing is selected (modal closed). */
  bookingId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ctx: SurfaceContext;
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
  const state = useCalendarBooking(booking);

  const openFullBooking = () => {
    // The deep, durable place — notes, parts, everything. Close the quick-look and
    // hand off to its own pane.
    onClose();
    ctx.open('scheduling.bookings.detail', { id: booking.id });
  };

  return (
    <>
      <ModalHeader booking={booking} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2">
        <SaveFailure title="That did not go through" message={state.actionError} />

        {booking.status === 'cancelled' && booking.cancellationReason ? (
          <Alert color="error">
            <AlertContent>
              <AlertTitle>Cancelled</AlertTitle>
              <AlertDescription>{booking.cancellationReason}</AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <LifecycleRow
          moves={state.moves}
          busy={state.busy}
          anyPending={state.anyPending}
          act={state.act}
        />

        {state.moves.reschedule ? (
          <MoveSection
            when={state.when}
            setWhen={state.setWhen}
            canMove={state.canMove}
            busy={state.busy.reschedule}
            onMove={state.act.move}
          />
        ) : null}

        {/* Change history — the old versions the booking row no longer keeps. */}
        <Section title="Change history">
          <BookingTimeline bookingId={booking.id} timezone={booking.timezone} />
        </Section>

        <EndingsRow
          moves={state.moves}
          busy={state.busy}
          anyPending={state.anyPending}
          act={state.act}
        />
      </div>

      <DialogFooter>
        {/* The dismiss half of the pair, COLORLESS: a bare `.btn` resolves to
            `base-content` and is theme-correct without naming `neutral`, which is
            not mine to choose (root RULE #4). */}
        <Button size="sm" onClick={onClose}>
          Close
        </Button>
        <Button color="module" variant="soft" size="sm" onClick={openFullBooking}>
          <Icon glyph={faArrowUpRight} className="size-4" aria-hidden />
          Open full booking
        </Button>
      </DialogFooter>
    </>
  );
}

export default CalendarBookingModal;
