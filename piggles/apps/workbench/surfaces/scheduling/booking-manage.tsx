'use client';

// ONE BOOKING, once it exists — where it is in its life, who it is for, when it
// happens, and the two ways it can end badly.
//
// Advancing it (confirm → check in → complete) is its position, so that lives in
// the toolbar. The rare, hard-to-undo outcomes sit at the bottom under a divider.

import { Badge, Text } from '@wizeworks/silicaui-react';

import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { useBookingManage } from './booking-manage-state';
import { BookingNotices } from './booking-notices';
import { BookingTimeline } from './booking-timeline';
import { BookingEndings } from './booking-endings';
import { BookingLifecycle } from './booking-lifecycle';
import { BookingMove, BookingNotes } from './booking-editing';
import { depositLine } from './booking-money';
import { BookingWho } from './booking-who';
import { COLUMN } from './booking-shell';
import { SaveFailure } from '@/components/save-failure';
import {
  bookingResourceLabel,
  bookingStateMeta,
  bookingTypeLabel,
  formatWhen,
  type Booking,
} from './bookings-data';

export function BookingManage({
  ctx,
  booking,
  isFetching,
  updatedAt,
  onRefresh,
}: {
  ctx: SurfaceContext;
  booking: Booking;
  isFetching: boolean;
  updatedAt: number | undefined;
  onRefresh: () => void;
}) {
  const {
    id,
    notifyDone,
    update,
    confirm,
    checkIn,
    complete,
    noShow,
    cancel,
    reschedule,
    bookedCustomer,
    policy,
    notes,
    setNotes,
    staffNotes,
    setStaffNotes,
    notesChanged,
    rescheduleLocal,
    setRescheduleLocal,
    rescheduleMoved,
    actionError,
    guestName,
    who,
    saveNotes,
    doReschedule,
    terminal,
    lifecycleBusy,
  } = useBookingManage(ctx, booking);
  const meta = bookingStateMeta(booking.status);
  // Whether anything CAN be sent, which is a question about an ACCOUNT and not
  // about a person: `reachableChannels` in the scheduling engine returns nothing
  // for a booking with no `customerId`, so a walk-in written down by name is as
  // unreachable as an empty one. A name is not an address.
  const reachable = Boolean(booking.customerId);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Booking actions"
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={updatedAt} onRefresh={onRefresh} />
        }
        status={
          <Badge color={meta.tone} variant="soft" size="sm">
            {meta.label}
          </Badge>
        }
        primary={
          <BookingLifecycle
            booking={booking}
            confirm={confirm}
            checkIn={checkIn}
            complete={complete}
            busy={lifecycleBusy}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {/* The service names the pane's TAB, so the body opens with the rest of
              it — when this is, who it is with, and where the money stands. */}
          <div className="flex flex-col gap-1">
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
            <Text className="text-sm">{depositLine(booking, policy.data)}</Text>
          </div>

          <SaveFailure title="That did not go through" message={actionError} />

          <BookingWho
            ctx={ctx}
            customerId={booking.customerId}
            customer={bookedCustomer.data}
            guestName={guestName}
          />

          {!terminal ? (
            <BookingMove
              rescheduleLocal={rescheduleLocal}
              setRescheduleLocal={setRescheduleLocal}
              moved={rescheduleMoved}
              isPending={reschedule.isPending}
              onMove={doReschedule}
            />
          ) : null}

          <BookingNotes
            notes={notes}
            setNotes={setNotes}
            staffNotes={staffNotes}
            setStaffNotes={setStaffNotes}
            changed={notesChanged}
            isPending={update.isPending}
            onSave={saveNotes}
          />

          {/* What the CUSTOMER has been told, as opposed to what happened. It sits
              above the history because "will they be reminded" is a question about
              tomorrow, and the history is a question about yesterday. */}
          {/* "This customer" is only true when there is one. A booking taken
              without an account said "everything this customer is told" and
              "nothing was ever sent to this customer" about a customer that does
              not exist, which reads as a delivery failure rather than as there
              being nobody to deliver to. */}
          <FormSection
            title="What reaches them"
            description={
              reachable
                ? 'Everything this customer is told about their booking, sent and still to come.'
                : 'Nobody on this booking has an account, so there is no address to send a confirmation or a reminder to.'
            }
          >
            <BookingNotices
              bookingId={id}
              timezone={booking.timezone}
              reachable={reachable}
              stillAhead={!terminal && new Date(booking.startAt).getTime() > Date.now()}
            />
          </FormSection>

          {/* The change history — what has happened to this booking, and the old
              values its own row no longer keeps. Read-only, newest first. */}
          <FormSection
            title="History"
            description="Everything that has happened to this booking, most recent first."
          >
            <BookingTimeline bookingId={id} timezone={booking.timezone} />
          </FormSection>

          {!terminal ? (
            <BookingEndings
              booking={booking}
              policy={policy.data}
              noShow={noShow}
              cancel={cancel}
              onDone={notifyDone}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
