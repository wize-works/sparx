// Scheduling — appointments, jobs, and the time you have to give.

import {
  faBriefcase,
  faCalendarClock,
  faCalendarDays,
  faChartColumn,
  faClock,
  faHourglass,
  faLink,
  faLocationDot,
  faRepeat,
  faShieldCheck,
  faUsers,
} from '@fortawesome/pro-solid-svg-icons';
import type { SurfaceDefinition } from '../registry';

import { CalendarSurface } from '../../../surfaces/scheduling/calendar';
import { CalendarConnectionsSurface } from '../../../surfaces/scheduling/calendar-connections';
import { BookingsListSurface } from '../../../surfaces/scheduling/bookings-list';
import { BookingDetailSurface } from '../../../surfaces/scheduling/bookings-detail';
import { SeriesListSurface } from '../../../surfaces/scheduling/series-list';
import { SeriesDetailSurface } from '../../../surfaces/scheduling/series-detail';
import { WaitlistSurface } from '../../../surfaces/scheduling/waitlist-list';
import { ServicesListSurface } from '../../../surfaces/scheduling/services-list';
import { ServiceDetailSurface } from '../../../surfaces/scheduling/service-detail';
import { ResourcesListSurface } from '../../../surfaces/scheduling/resources-list';
import { LocationsListSurface } from '../../../surfaces/scheduling/locations-list';
import { LocationDetailSurface } from '../../../surfaces/scheduling/location-detail';
import { ResourceDetailSurface } from '../../../surfaces/scheduling/resource-detail';
import { AvailabilitySurface } from '../../../surfaces/scheduling/availability-settings';
import { PoliciesListSurface } from '../../../surfaces/scheduling/policies-list';
import { PolicyDetailSurface } from '../../../surfaces/scheduling/policy-detail';
import { SchedulingReportsSurface } from '../../../surfaces/scheduling/reports';

export const SCHEDULING_SURFACES: SurfaceDefinition[] = [
  /* ── Diary ─────────────────────────────────────────────────────────────── */
  {
    key: 'scheduling.calendar',
    title: 'Calendar',
    module: 'scheduling',
    icon: faCalendarDays,
    order: 1,
    keywords: ['diary', 'schedule', 'week', 'day', 'agenda'],
    component: CalendarSurface,
  },
  {
    key: 'scheduling.calendar.connections',
    title: 'Linked calendars',
    module: 'scheduling',
    icon: faLink,
    component: CalendarConnectionsSurface,
    listed: false,
    besideWidth: 0.42,
  },

  /* ── Bookings ──────────────────────────────────────────────────────────── */
  {
    key: 'scheduling.bookings.list',
    title: 'Bookings',
    module: 'scheduling',
    icon: faCalendarClock,
    section: 'Bookings',
    order: 10,
    keywords: ['appointments', 'jobs', 'reservations'],
    component: BookingsListSurface,
    createSurface: 'scheduling.bookings.detail',
    createLabel: 'Take a booking',
  },
  {
    key: 'scheduling.bookings.detail',
    title: (params) => (params.id === 'new' ? 'New booking' : 'Booking'),
    module: 'scheduling',
    icon: faCalendarClock,
    component: BookingDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },
  {
    key: 'scheduling.series.list',
    title: 'Repeating bookings',
    module: 'scheduling',
    icon: faRepeat,
    section: 'Bookings',
    order: 11,
    keywords: ['recurring', 'series', 'weekly', 'contract'],
    component: SeriesListSurface,
    createSurface: 'scheduling.series.detail',
    createLabel: 'Repeating booking',
  },
  {
    key: 'scheduling.series.detail',
    title: (params) => (params.id === 'new' ? 'New repeating booking' : 'Repeating booking'),
    module: 'scheduling',
    icon: faRepeat,
    component: SeriesDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },
  {
    key: 'scheduling.waitlist',
    title: 'Waiting list',
    module: 'scheduling',
    icon: faHourglass,
    section: 'Bookings',
    order: 12,
    keywords: ['waitlist', 'cancellations', 'standby'],
    component: WaitlistSurface,
  },

  /* ── Setup ─────────────────────────────────────────────────────────────── */
  {
    key: 'scheduling.services.list',
    title: 'Services',
    module: 'scheduling',
    icon: faBriefcase,
    section: 'Setup',
    order: 20,
    keywords: ['what you offer', 'duration', 'price'],
    component: ServicesListSurface,
    createSurface: 'scheduling.services.detail',
    createLabel: 'New service',
  },
  {
    key: 'scheduling.services.detail',
    title: (params) => (params.id === 'new' ? 'New service' : 'Service'),
    module: 'scheduling',
    icon: faBriefcase,
    component: ServiceDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },
  {
    key: 'scheduling.resources.list',
    title: 'People & equipment',
    module: 'scheduling',
    icon: faUsers,
    section: 'Setup',
    order: 21,
    keywords: ['resources', 'staff', 'rooms', 'bays', 'vehicles'],
    component: ResourcesListSurface,
    createSurface: 'scheduling.resources.detail',
    createLabel: 'Add one',
  },
  {
    key: 'scheduling.resources.detail',
    title: (params) => (params.id === 'new' ? 'New resource' : 'Resource'),
    module: 'scheduling',
    icon: faUsers,
    component: ResourceDetailSurface,
    listed: false,
    besideWidth: 0.45,
  },
  {
    key: 'scheduling.locations.list',
    title: 'Places',
    module: 'scheduling',
    icon: faLocationDot,
    section: 'Setup',
    // After people & equipment (21): a place is where they work, so it reads as
    // the wider container and belongs next to them rather than above them.
    order: 21.5,
    keywords: ['locations', 'premises', 'shop', 'clinic', 'studio', 'branch', 'address'],
    component: LocationsListSurface,
    createSurface: 'scheduling.locations.detail',
    createLabel: 'Add a place',
  },
  {
    key: 'scheduling.locations.detail',
    title: (params) => (params.id === 'new' ? 'New place' : 'Place'),
    module: 'scheduling',
    icon: faLocationDot,
    component: LocationDetailSurface,
    listed: false,
    besideWidth: 0.45,
  },
  {
    key: 'scheduling.availability',
    title: 'Availability',
    module: 'scheduling',
    icon: faClock,
    section: 'Setup',
    order: 22,
    keywords: ['opening hours', 'working hours', 'holidays', 'time off'],
    component: AvailabilitySurface,
    singleton: true,
  },
  {
    key: 'scheduling.policies',
    title: 'Booking rules',
    module: 'scheduling',
    icon: faShieldCheck,
    section: 'Setup',
    order: 23,
    // 'reminder' is here because it is the word somebody types when they want the
    // day-before nudge, and this is the only screen that decides when one goes out.
    keywords: ['policies', 'cancellation', 'deposit', 'notice', 'no show', 'reminder', 'reminders'],
    component: PoliciesListSurface,
    createSurface: 'scheduling.policies.detail',
    createLabel: 'New rule set',
  },
  {
    key: 'scheduling.policies.detail',
    title: (params) => (params.id === 'new' ? 'New rule set' : 'Rule set'),
    module: 'scheduling',
    icon: faShieldCheck,
    component: PolicyDetailSurface,
    listed: false,
    besideWidth: 0.5,
  },

  /* ── Reporting ─────────────────────────────────────────────────────────── */
  {
    key: 'scheduling.reports',
    title: 'Reports',
    module: 'scheduling',
    icon: faChartColumn,
    section: 'Reporting',
    order: 30,
    keywords: [
      'utilization',
      'utilisation',
      'no shows',
      'busiest',
      'analytics',
      'bookings',
      'revenue',
    ],
    component: SchedulingReportsSurface,
  },
];
