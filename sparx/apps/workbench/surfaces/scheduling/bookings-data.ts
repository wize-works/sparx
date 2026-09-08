'use client';

// ══════════════════════════════════════════════════════════════════════════
// THE SCHEDULING BOOKINGS DATA LAYER
//
// Everything the three Bookings surfaces read and write lives here: the booking
// list + record, the recurring-series list + record, and the waiting list. It
// also holds the small LOOKUP reads those forms need — the bookable services, the
// resources a booking can consume, and a customer search — so no surface in this
// folder declares a query key, a fetch, or a row type of its own.
//
// ── The key contract ──────────────────────────────────────────────────────
//
//   ['scheduling','bookings']                  the root every booking read nests under
//   ['scheduling','bookings','list',{query}]   one window of the booking list
//   ['scheduling','bookings', id]              one booking, in full
//   ['scheduling','series']                    the recurring-series root
//   ['scheduling','series','list',{query}]     one window of the series list
//   ['scheduling','series', id]                one series, with its occurrences
//   ['scheduling','waitlist','list',{query}]   the waiting list (a bounded read)
//   ['scheduling','lookup', …]                 services / resources / customers pickers
//
// A materialised series occurrence IS a normal booking, so anything that writes a
// series also refreshes the booking root — the occurrences it created or cancelled
// live in the same list and calendar.
//
// The write PAYLOADS below are narrow, local shapes carrying only the fields these
// panes send. The server runs the real Zod (`@wizeworks/scheduling-schemas`) on every
// write and has the final say — this app deliberately does not depend on that
// package, matching the house pattern in commerce/discounts-data and crm/customers-data.
// ══════════════════════════════════════════════════════════════════════════

import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { ApiError } from '@wizeworks/api-client';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';

/* ── Shapes: the booking record ─────────────────────────────────────────── */

/** The bookable thing, as embedded on a booking or offered in a picker. */
export interface ServiceLite {
  id: string;
  name: string;
  bookingType: BookingType;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  color: string | null;
}

/** Anything a booking consumes the time of — a member of staff, a room, a bay. */
export interface ResourceLite {
  id: string;
  name: string;
  kind: string;
  color: string | null;
}

/** One resource allocated to a booking (staff/room), with its own window. */
export interface BookingResourceRow {
  id: string;
  role: string;
  status: string;
  startAt: string;
  endAt: string;
  resource: ResourceLite;
}

/** One seat on a class / party member on a reservation. */
export interface BookingAttendeeRow {
  id: string;
  customerId: string | null;
  guestName: string | null;
  partySize: number;
  status: string;
  waitlistPosition: number | null;
}

export type BookingType = 'appointment' | 'class' | 'reservation' | 'rental';
export type BookingStatus =
  'requested' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show' | 'waitlisted';

/**
 * One booking in full — the shape the list rows AND the detail pane both read
 * (the server returns the same nested relations for each). Times are ISO strings;
 * `timezone` is the zone the booking was made in and is what its times should be
 * shown in.
 */
export interface Booking {
  id: string;
  serviceId: string;
  bookingType: BookingType;
  seriesId: string | null;
  locationId: string | null;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  timezone: string;
  capacity: number;
  partySize: number | null;
  customerId: string | null;
  companyId: string | null;
  assetRef: Record<string, unknown> | null;
  partsLinked: unknown[];
  workOrderId: string | null;
  source: string;
  policyId: string | null;
  depositStatus: string | null;
  paymentIntentId: string | null;
  intakeSubmissionId: string | null;
  notes: string | null;
  staffNotes: string | null;
  confirmedAt: string | null;
  checkedInAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  noShowAt: string | null;
  createdAt: string;
  updatedAt: string;
  service: ServiceLite;
  resources: BookingResourceRow[];
  attendees: BookingAttendeeRow[];
}

/* ── Shapes: recurring series ───────────────────────────────────────────── */

export type SeriesStatus = 'active' | 'completed' | 'cancelled';

export interface BookingSeries {
  id: string;
  serviceId: string;
  rrule: string;
  status: SeriesStatus;
  customerId: string | null;
  resourceIds: string[];
  materializedThrough: string | null;
  serviceName: string | null;
  totalBookings: number;
  upcomingBookings: number;
  createdAt: string;
  updatedAt: string;
}

/** A compact occurrence row on a series detail — a real booking, but the detail
 *  only needs when it is and where it stands. */
export interface SeriesOccurrence {
  id: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
}

export interface BookingSeriesDetail extends BookingSeries {
  bookings: SeriesOccurrence[];
}

/* ── Shapes: waiting list ───────────────────────────────────────────────── */

export type WaitlistStatus = 'waiting' | 'offered' | 'booked' | 'expired' | 'cancelled';

export interface WaitlistEntry {
  id: string;
  serviceId: string;
  customerId: string;
  resourcePref: string | null;
  desiredFrom: string;
  desiredTo: string;
  status: WaitlistStatus;
  offeredAt: string | null;
  offerExpiresAt: string | null;
  createdAt: string;
  serviceName: string | null;
  customerName: string;
  customerEmail: string | null;
}

/** A person to book for, in the customer search. */
export interface CustomerLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
}

/* ── Query keys ─────────────────────────────────────────────────────────── */

export type BookingOrder = 'asc' | 'desc';

export interface BookingQuery {
  q?: string;
  status?: BookingStatus | '';
  bookingType?: BookingType | '';
  order: BookingOrder;
  take: number;
  skip: number;
}

export interface SeriesQuery {
  q?: string;
  status?: SeriesStatus | '';
  take: number;
  skip: number;
}

export interface WaitlistQuery {
  q?: string;
  serviceId?: string;
  status?: WaitlistStatus | '';
  take: number;
  skip: number;
}

export const bookingKeys = {
  all: ['scheduling', 'bookings'] as const,
  list: (query: BookingQuery) => [...bookingKeys.all, 'list', query] as const,
  detail: (id: string) => [...bookingKeys.all, id] as const,
  timeline: (id: string) => [...bookingKeys.all, id, 'timeline'] as const,
};

export const seriesKeys = {
  all: ['scheduling', 'series'] as const,
  list: (query: SeriesQuery) => [...seriesKeys.all, 'list', query] as const,
  detail: (id: string) => [...seriesKeys.all, id] as const,
};

export const waitlistKeys = {
  all: ['scheduling', 'waitlist'] as const,
  list: (query: WaitlistQuery) => [...waitlistKeys.all, 'list', query] as const,
};

export const lookupKeys = {
  services: (q: string, type: BookingType | '') =>
    ['scheduling', 'lookup', 'services', { q, type }] as const,
  resources: () => ['scheduling', 'lookup', 'resources'] as const,
  customers: (q: string) => ['scheduling', 'lookup', 'customers', { q }] as const,
  customer: (id: string) => ['scheduling', 'lookup', 'customer', id] as const,
};

/* ── Reads: bookings ────────────────────────────────────────────────────── */

/**
 * One window of the booking list.
 *
 * Every narrowing — search, status, type, ordering, paging — is a SERVER filter.
 * "The soonest ten requested appointments" is a question about the whole diary,
 * not about whichever page happens to be loaded, so filtering the loaded rows in
 * the browser would answer it with the wrong ten.
 */
export function useBookings(query: BookingQuery) {
  return useQuery({
    queryKey: bookingKeys.list(query),
    queryFn: () =>
      api.list<Booking>('/v1/scheduling/bookings', {
        ...(query.q ? { q: query.q } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.bookingType ? { bookingType: query.bookingType } : {}),
        order: query.order,
        take: query.take,
        skip: query.skip,
      }),
    // Hold the current window on screen while the next one loads, so paging and
    // re-sorting don't blink the table out and back.
    placeholderData: (previous) => previous,
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: bookingKeys.detail(id),
    queryFn: () => api.get<Booking>(`/v1/scheduling/bookings/${id}`),
    enabled: id !== 'new',
    // A 404 means the booking is gone — an answer, not a fault worth three retries.
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/* ── Reads: the change history ──────────────────────────────────────────── */

/** One entry in a booking's audit trail, exactly as `GET …/:id/timeline` returns
 *  it. `diff` carries whatever the action recorded — old→new times for a move,
 *  a `changes` map for an edit, a reason for a cancellation — or nothing. */
export interface BookingTimelineEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorType: string | null;
  diff: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * The lifecycle trail for one booking — created, confirmed, moved, edited,
 * cancelled, and so on. Nested under the booking's own key, so every lifecycle
 * write (which invalidates the booking root) refreshes this too.
 */
export function useBookingTimeline(id: string) {
  return useQuery({
    queryKey: bookingKeys.timeline(id),
    queryFn: () => api.get<BookingTimelineEntry[]>(`/v1/scheduling/bookings/${id}/timeline`),
    enabled: id !== '' && id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/* ── Reads: series ──────────────────────────────────────────────────────── */

export function useBookingSeriesList(query: SeriesQuery) {
  return useQuery({
    queryKey: seriesKeys.list(query),
    queryFn: () =>
      api.list<BookingSeries>('/v1/scheduling/series', {
        ...(query.q ? { q: query.q } : {}),
        ...(query.status ? { status: query.status } : {}),
        take: query.take,
        skip: query.skip,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useBookingSeries(id: string) {
  return useQuery({
    queryKey: seriesKeys.detail(id),
    queryFn: () => api.get<BookingSeriesDetail>(`/v1/scheduling/series/${id}`),
    enabled: id !== 'new',
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/* ── Reads: waiting list ────────────────────────────────────────────────── */

/**
 * One window of the waiting list.
 *
 * Search, status, service and paging are ALL server filters — the endpoint holds
 * past a handful of entries now, so "the next fifty people waiting for this
 * service" is a question about the whole list, not about whichever page happens
 * to be loaded. The text needle matches the waiting customer's name/email and the
 * service name in the DB, so a mistyped search still answers against everything.
 */
export function useWaitlist(query: WaitlistQuery) {
  return useQuery({
    queryKey: waitlistKeys.list(query),
    queryFn: () =>
      api.list<WaitlistEntry>('/v1/scheduling/waitlist', {
        ...(query.q ? { q: query.q } : {}),
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
        ...(query.status ? { status: query.status } : {}),
        take: query.take,
        skip: query.skip,
      }),
    // Hold the current window while the next loads, so paging and re-filtering
    // don't blink the table out and back.
    placeholderData: (previous) => previous,
  });
}

/* ── Reads: the pickers ─────────────────────────────────────────────────── */

/** The bookable services, for the service picker on a create form. Long-lived —
 *  the catalog of what you offer changes rarely and is referenced constantly. */
export function useSchedulingServices(q: string, type: BookingType | '' = '') {
  return useQuery({
    queryKey: lookupKeys.services(q, type),
    queryFn: () =>
      api.list<ServiceLite>('/v1/scheduling/services', {
        ...(q ? { q } : {}),
        ...(type ? { bookingType: type } : {}),
        activeOnly: true,
        take: 250,
      }),
    staleTime: 5 * 60_000,
  });
}

/** The resources a booking can be pinned to. Empty selection lets the engine
 *  assign one; naming them is what a "pick your stylist" service needs. */
export function useSchedulingResources() {
  return useQuery({
    queryKey: lookupKeys.resources(),
    queryFn: () => api.get<ResourceLite[]>('/v1/scheduling/resources', { activeOnly: true }),
    staleTime: 5 * 60_000,
  });
}

/** One customer by id — used to put a real name on a booking whose row carries
 *  only a `customerId` (the booking API does not join the customer name). */
export function useCustomer(id: string | null | undefined) {
  return useQuery({
    queryKey: lookupKeys.customer(id ?? ''),
    queryFn: () => api.get<CustomerLite>(`/v1/crm/customers/${id ?? ''}`),
    enabled: Boolean(id),
    staleTime: 60_000,
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 404 ? false : failureCount < 2,
  });
}

/** Find a customer to book for. Debounce-free by design — the caller only enables
 *  it once a couple of characters are typed. */
export function useCustomerSearch(q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: lookupKeys.customers(query),
    queryFn: () => api.list<CustomerLite>('/v1/crm/customers', { q: query, take: 20 }),
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}

/* ── Invalidation ───────────────────────────────────────────────────────── */

/** The one way anything here says "a booking changed" — refreshes every booking
 *  list window and, when known, the one record that moved. */
export function useInvalidateBookings() {
  const queryClient = useQueryClient();
  return (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    if (id) void queryClient.invalidateQueries({ queryKey: bookingKeys.detail(id) });
  };
}

/* ── Write payloads ─────────────────────────────────────────────────────── */

export interface CreateBookingPayload {
  serviceId: string;
  startAt: string;
  timezone?: string;
  customerId?: string;
  partySize?: number;
  resourceIds: string[];
  notes?: string;
  source: string;
}

export interface UpdateBookingPayload {
  notes?: string | null;
  staffNotes?: string | null;
}

/* ── Writes: bookings ───────────────────────────────────────────────────── */

export function useCreateBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (input: CreateBookingPayload) =>
      api.post<Booking>('/v1/scheduling/bookings', input),
    onSuccess: (booking) => {
      invalidate(booking.id);
    },
  });
}

export function useUpdateBooking(id: string) {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (input: UpdateBookingPayload) =>
      api.patch<Booking>(`/v1/scheduling/bookings/${id}`, input),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

/** The lifecycle moves — each a dedicated server action, never a free-form status
 *  write, because entering a stage has effects (releasing a slot, capturing a fee). */
function useBookingAction(id: string, action: string) {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (body?: Record<string, unknown>) =>
      api.post<Booking>(`/v1/scheduling/bookings/${id}/${action}`, body ?? {}),
    onSuccess: () => {
      invalidate(id);
    },
  });
}

export function useConfirmBooking(id: string) {
  return useBookingAction(id, 'confirm');
}
export function useCheckInBooking(id: string) {
  return useBookingAction(id, 'check-in');
}
export function useCompleteBooking(id: string) {
  return useBookingAction(id, 'complete');
}
export function useNoShowBooking(id: string) {
  return useBookingAction(id, 'no-show');
}
export function useCancelBooking(id: string) {
  return useBookingAction(id, 'cancel');
}
export function useRescheduleBooking(id: string) {
  return useBookingAction(id, 'reschedule');
}

/* ── Writes: series ─────────────────────────────────────────────────────── */

export interface CreateSeriesPayload {
  serviceId: string;
  startAt: string;
  rrule: string;
  customerId?: string;
  resourceIds: string[];
}

export interface CreatedSeriesResult {
  series: BookingSeries;
  created: SeriesOccurrence[];
  skipped: { startAt: string; reason: string }[];
}

export function useCreateSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSeriesPayload) =>
      api.post<CreatedSeriesResult>('/v1/scheduling/series', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: seriesKeys.all });
      // Every occurrence it materialised is a booking in the booking list.
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

export function useCancelSeries(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { scope: 'future' | 'all'; reason?: string }) =>
      api.post<{ id: string; cancelled: number }>(`/v1/scheduling/series/${id}/cancel`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: seriesKeys.all });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

/* ── Writes: waiting list ───────────────────────────────────────────────── */

export interface CreateWaitlistPayload {
  serviceId: string;
  customerId: string;
  resourcePref?: string;
  desiredFrom: string;
  desiredTo: string;
}

export function useInvalidateWaitlist() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: waitlistKeys.all });
  };
}

export function useCreateWaitlistEntry() {
  const invalidate = useInvalidateWaitlist();
  return useMutation({
    mutationFn: (input: CreateWaitlistPayload) =>
      api.post<WaitlistEntry>('/v1/scheduling/waitlist', input),
    onSuccess: () => {
      invalidate();
    },
  });
}

export function useOfferWaitlist(id: string) {
  const invalidate = useInvalidateWaitlist();
  return useMutation({
    mutationFn: (input: { offerTtlMinutes: number }) =>
      api.post<WaitlistEntry>(`/v1/scheduling/waitlist/${id}/offer`, input),
    onSuccess: () => {
      invalidate();
    },
  });
}

export function useAcceptWaitlist(id: string) {
  const invalidate = useInvalidateWaitlist();
  const invalidateBookings = useInvalidateBookings();
  return useMutation({
    mutationFn: (input: { startAt: string; resourceIds: string[] }) =>
      api.post<{ entry: WaitlistEntry; bookingId: string }>(
        `/v1/scheduling/waitlist/${id}/accept`,
        input
      ),
    onSuccess: (result) => {
      invalidate();
      invalidateBookings(result.bookingId);
    },
  });
}

export function useRemoveWaitlist(id: string) {
  const invalidate = useInvalidateWaitlist();
  return useMutation({
    mutationFn: () => api.delete<WaitlistEntry>(`/v1/scheduling/waitlist/${id}`),
    onSuccess: () => {
      invalidate();
    },
  });
}

/* ── Saying what a status means ─────────────────────────────────────────── */

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** A booking's status in the words an owner uses, plus its semantic color. */
export function bookingStateMeta(status: BookingStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'requested':
      return { label: 'Awaiting confirmation', tone: 'warning' };
    case 'confirmed':
      return { label: 'Confirmed', tone: 'success' };
    case 'in_progress':
      return { label: 'In progress', tone: 'info' };
    case 'completed':
      return { label: 'Completed', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'danger' };
    case 'no_show':
      return { label: 'Did not turn up', tone: 'danger' };
    case 'waitlisted':
      return { label: 'On the waiting list', tone: 'info' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

/** True once a booking can no longer move through its lifecycle. */
export function isTerminalBooking(status: BookingStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'no_show';
}

export function bookingTypeLabel(type: BookingType): string {
  switch (type) {
    case 'appointment':
      return 'Appointment';
    case 'class':
      return 'Class';
    case 'reservation':
      return 'Reservation';
    case 'rental':
      return 'Rental';
    default:
      return type;
  }
}

export function seriesStateMeta(status: SeriesStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'Running', tone: 'success' };
    case 'completed':
      return { label: 'Finished', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Stopped', tone: 'danger' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

export function waitlistStateMeta(status: WaitlistStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'waiting':
      return { label: 'Waiting', tone: 'info' };
    case 'offered':
      return { label: 'Slot offered', tone: 'warning' };
    case 'booked':
      return { label: 'Booked in', tone: 'success' };
    case 'expired':
      return { label: 'Offer lapsed', tone: 'neutral' };
    case 'cancelled':
      return { label: 'Removed', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

/* ── Names, times, money ────────────────────────────────────────────────── */

export function customerName(customer: CustomerLite | null | undefined): string {
  if (!customer) return 'A customer';
  const full = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (customer.company?.trim()) return customer.company;
  if (customer.email?.trim()) return customer.email;
  return 'A customer';
}

/** Who a booking is for, from what the list actually carries. There is no
 *  customer name on a booking row (the API does not join it), so this reads the
 *  guest name off a single-attendee booking, or falls back to the party count. */
export function bookingWhoLabel(booking: Booking): string {
  const named = booking.attendees.find((a) => a.guestName?.trim());
  if (named?.guestName) return named.guestName;
  if (booking.attendees.length > 1) return `${String(booking.attendees.length)} people`;
  if (booking.partySize && booking.partySize > 1) {
    return `Party of ${String(booking.partySize)}`;
  }
  return booking.customerId ? 'A customer' : 'No one assigned';
}

/** The staff / rooms a booking is with, named. */
export function bookingResourceLabel(booking: Booking): string {
  if (booking.resources.length === 0) return 'Not yet assigned';
  return booking.resources.map((r) => r.resource.name).join(', ');
}

/** A booking's date + time, shown in the zone it was made in. */
export function formatWhen(iso: string, timezone?: string | null): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);
}

/** Just the day part, for grouping and short columns. */
export function formatDay(iso: string, timezone?: string | null): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);
}

/** Just the clock part. */
export function formatClock(iso: string, timezone?: string | null): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(date);
}

export function formatMoney(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** The browser's own time zone — the zone a booking made here was made in. */
export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/* ── datetime-local <-> ISO ─────────────────────────────────────────────── */

/** An `<input type="datetime-local">` value for a given instant, in LOCAL time —
 *  which is what that control shows and edits. */
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The instant a datetime-local value names, as an ISO string. Empty → null. */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/* ── Recurrence: building and reading an RRULE ──────────────────────────── */

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type EndsMode = 'never' | 'count' | 'until';

export const WEEKDAYS: { code: string; label: string; short: string }[] = [
  { code: 'MO', label: 'Monday', short: 'Mon' },
  { code: 'TU', label: 'Tuesday', short: 'Tue' },
  { code: 'WE', label: 'Wednesday', short: 'Wed' },
  { code: 'TH', label: 'Thursday', short: 'Thu' },
  { code: 'FR', label: 'Friday', short: 'Fri' },
  { code: 'SA', label: 'Saturday', short: 'Sat' },
  { code: 'SU', label: 'Sunday', short: 'Sun' },
];

export interface RecurrenceDraft {
  freq: Frequency;
  interval: number;
  byDay: string[];
  ends: EndsMode;
  count: number;
  until: string;
}

/** RFC-5545 UNTIL wants `YYYYMMDDT000000Z`; the picker gives `YYYY-MM-DD`. */
function toUntil(day: string): string | null {
  if (!day) return null;
  const compact = day.replace(/-/g, '');
  if (compact.length !== 8) return null;
  return `${compact}T000000Z`;
}

/** Assemble an RRULE from the friendly draft, or null if it is not yet valid. */
export function buildRrule(draft: RecurrenceDraft): string | null {
  if (draft.interval < 1) return null;
  if (draft.freq === 'WEEKLY' && draft.byDay.length === 0) return null;
  const parts = [`FREQ=${draft.freq}`];
  if (draft.interval > 1) parts.push(`INTERVAL=${String(draft.interval)}`);
  if (draft.freq === 'WEEKLY' && draft.byDay.length > 0) {
    // Keep the canonical week order regardless of click order.
    const ordered = WEEKDAYS.filter((d) => draft.byDay.includes(d.code)).map((d) => d.code);
    parts.push(`BYDAY=${ordered.join(',')}`);
  }
  if (draft.ends === 'count') {
    if (draft.count < 1) return null;
    parts.push(`COUNT=${String(draft.count)}`);
  }
  if (draft.ends === 'until') {
    const until = toUntil(draft.until);
    if (!until) return null;
    parts.push(`UNTIL=${until}`);
  }
  return parts.join(';');
}

interface ParsedRule {
  freq: string | null;
  interval: number;
  byDay: string[];
  count: number | null;
  until: string | null;
}

function parseRrule(rrule: string): ParsedRule {
  const body = rrule.replace(/^RRULE:/i, '').trim();
  const map = new Map<string, string>();
  for (const pair of body.split(';')) {
    const [k, v] = pair.split('=');
    if (k && v) map.set(k.toUpperCase(), v);
  }
  const intervalRaw = map.get('INTERVAL');
  const countRaw = map.get('COUNT');
  return {
    freq: map.get('FREQ') ?? null,
    interval: intervalRaw ? Number(intervalRaw) : 1,
    byDay: map.get('BYDAY')?.split(',').filter(Boolean) ?? [],
    count: countRaw ? Number(countRaw) : null,
    until: map.get('UNTIL') ?? null,
  };
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join('');
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** An RRULE said in plain words — "Every 2 weeks on Monday and Wednesday, 12 times." */
export function humanizeRrule(rrule: string): string {
  const rule = parseRrule(rrule);
  if (!rule.freq) return 'A custom repeating pattern';

  const unit =
    rule.freq === 'DAILY'
      ? { one: 'day', many: 'days' }
      : rule.freq === 'WEEKLY'
        ? { one: 'week', many: 'weeks' }
        : rule.freq === 'MONTHLY'
          ? { one: 'month', many: 'months' }
          : { one: 'time', many: 'times' };

  const every =
    rule.interval > 1 ? `Every ${String(rule.interval)} ${unit.many}` : `Every ${unit.one}`;

  let sentence = every;
  if (rule.freq === 'WEEKLY' && rule.byDay.length > 0) {
    const days = rule.byDay
      .map((code) => WEEKDAYS.find((d) => d.code === code)?.label ?? code)
      .filter(Boolean);
    sentence += ` on ${joinWords(days)}`;
  }
  if (rule.count) {
    sentence += `, ${String(rule.count)} ${rule.count === 1 ? 'time' : 'times'}`;
  } else if (rule.until) {
    const year = rule.until.slice(0, 4);
    const month = rule.until.slice(4, 6);
    const day = rule.until.slice(6, 8);
    const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      sentence += `, until ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsed)}`;
    }
  } else {
    sentence += ', ongoing';
  }
  return sentence;
}

/* ── Errors ─────────────────────────────────────────────────────────────── */

/**
 * The server's own sentence for a 4xx, shown verbatim — these routes name the
 * real problem ("That time is outside the requested window", "This offer has
 * expired", a slot clash) far better than a status code could. A 5xx carries no
 * such sentence, so it falls back to the caller's wording.
 */
export function schedulingErrorMessage(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

/** True when the thing behind this pane no longer exists. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/* ── Reading the change history in plain words ──────────────────────────── */

/** The fields a `booking.updated` entry can carry, in the words an owner uses. */
const UPDATED_FIELD_LABELS: Record<string, string> = {
  notes: 'the note the customer sees',
  staffNotes: 'the private team note',
  assetRef: 'the linked item',
  partsLinked: 'the linked parts',
  locationId: 'the location',
  workOrderId: 'the linked job',
};

/** The human names of whatever an edit changed, read off its `changes` map. */
function changedFieldLabels(diff: Record<string, unknown>): string[] {
  const changes = diff.changes;
  if (!changes || typeof changes !== 'object') return [];
  return Object.keys(changes as Record<string, unknown>).map(
    (key) => UPDATED_FIELD_LABELS[key] ?? key
  );
}

/**
 * One history entry said in plain words — a headline plus an optional line of
 * detail. Never invents anything: every branch reads only what the entry itself
 * recorded, and an unknown action degrades to a quiet "Updated".
 */
export function describeTimelineEntry(
  entry: BookingTimelineEntry,
  timezone?: string | null
): { label: string; detail: string | null } {
  const diff = entry.diff ?? {};
  switch (entry.action) {
    case 'booking.created':
      return { label: 'Booking taken', detail: null };
    case 'booking.confirmed':
      return { label: 'Confirmed', detail: null };
    case 'booking.checked_in':
      return { label: 'Customer checked in', detail: null };
    case 'booking.completed':
      return { label: 'Marked complete', detail: null };
    case 'booking.no_show':
      return { label: 'Marked as a no-show', detail: null };
    case 'booking.cancelled': {
      const reason = typeof diff.reason === 'string' && diff.reason.trim() ? diff.reason : null;
      return { label: 'Cancelled', detail: reason };
    }
    case 'booking.rescheduled': {
      const from = typeof diff.fromStartAt === 'string' ? diff.fromStartAt : null;
      const to = typeof diff.toStartAt === 'string' ? diff.toStartAt : null;
      if (from && to) {
        return {
          label: 'Moved to a new time',
          detail: `From ${formatWhen(from, timezone)} to ${formatWhen(to, timezone)}`,
        };
      }
      return { label: 'Moved to a new time', detail: null };
    }
    case 'booking.updated': {
      const fields = changedFieldLabels(diff);
      const detail = fields.length ? `Changed ${joinWords(fields)}` : null;
      return { label: 'Details updated', detail };
    }
    default:
      return { label: 'Updated', detail: null };
  }
}

/** Who made a change, in the words we can honestly stand behind — the trail
 *  keeps an actor TYPE, not a resolved name. */
export function timelineActorLabel(entry: BookingTimelineEntry): string {
  return entry.actorType === 'system' ? 'Automatic' : 'A team member';
}

/** A timestamp as "just now" / "3 hours ago", falling back to a real date once a
 *  change is old enough that a relative phrase reads worse than the day itself. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${String(days)} day${days === 1 ? '' : 's'} ago`;
  return formatDay(iso);
}
