// Customers — the CRM module's surfaces.

import {
  faBoxes,
  faBuilding,
  faBullseye,
  faCalendarClock,
  faChartColumn,
  faClock,
  faCopy,
  faDiagramProject,
  faFileText,
  faFilter,
  faGauge,
  faLifeRing,
  faListCheck,
  faMailbox,
  faPhoneVolume,
  faQuoteLeft,
  faReceipt,
  faSliders,
  faTable,
  faUsers,
} from '@fortawesome/pro-solid-svg-icons';
import type { SurfaceDefinition } from '../registry';
import { CustomersListSurface } from '../../../surfaces/crm/customers-list';
import { CustomerDetailSurface } from '../../../surfaces/crm/customer-detail';
import { CompaniesListSurface } from '../../../surfaces/crm/companies-list';
import { CompanyDetailSurface } from '../../../surfaces/crm/company-detail';
import { SegmentsListSurface } from '../../../surfaces/crm/segments-list';
import { SegmentDetailSurface } from '../../../surfaces/crm/segment-detail';
import { DuplicatesSurface } from '../../../surfaces/crm/duplicates';
import { DealsListSurface } from '../../../surfaces/crm/deals-list';
import { DealDetailSurface } from '../../../surfaces/crm/deal-detail';
import { PipelinesListSurface } from '../../../surfaces/crm/pipelines-list';
import { PipelineDetailSurface } from '../../../surfaces/crm/pipeline-detail';
import { TasksListSurface } from '../../../surfaces/crm/tasks-list';
import { TaskDetailSurface } from '../../../surfaces/crm/task-detail';
import { CustomerOrdersSurface } from '../../../surfaces/crm/customer-orders';
import { CrmReportsSurface } from '../../../surfaces/crm/reports';
import { ReportsLibrarySurface } from '../../../surfaces/crm/reports-library';
import { ReportBuilderSurface } from '../../../surfaces/crm/report-builder';
import { DashboardsSurface } from '../../../surfaces/crm/dashboards';
import { ScoringSurface } from '../../../surfaces/crm/scoring';
import { ObjectTypesListSurface } from '../../../surfaces/crm/object-types-list';
import { ObjectTypeDetailSurface } from '../../../surfaces/crm/object-type-detail';
import { MailboxesListSurface } from '../../../surfaces/crm/mailboxes-list';
import { MailboxConnectSurface } from '../../../surfaces/crm/mailbox-connect';
import { PhoneSystemsListSurface } from '../../../surfaces/crm/phone-systems-list';
import { PhoneSystemConnectSurface } from '../../../surfaces/crm/phone-system-connect';
import { TicketsListSurface } from '../../../surfaces/crm/tickets-list';
import { TicketDetailSurface } from '../../../surfaces/crm/ticket-detail';
import { SlaPoliciesSurface } from '../../../surfaces/crm/sla-policies';
import { CrmSettingsSurface } from '../../../surfaces/crm/crm-settings';
import { MeetingLinksSurface } from '../../../surfaces/crm/meeting-links';
import { RecordsListSurface } from '../../../surfaces/crm/records-list';
import { RecordDetailSurface } from '../../../surfaces/crm/record-detail';
import { TemplatesListSurface } from '../../../surfaces/crm/templates-list';
import { SnippetsListSurface } from '../../../surfaces/crm/snippets-list';

export const CRM_SURFACES: SurfaceDefinition[] = [
  /* ── The workspace layer (docs/144 §11 + §12) ──────────────────────────── */
  //
  // These two used to sit in a section called 'Setup' while record types,
  // mailboxes and phone systems sat in one called 'Setting up' — so the nav
  // rendered TWO groups that mean the same thing, one at the top and one at the
  // bottom, and somebody hunting for a setting had to notice that both existed.
  // Section names are matched as strings; there is one now.
  {
    key: 'crm.settings',
    title: 'How the CRM behaves',
    module: 'crm',
    icon: faSliders,
    section: 'Setting up',
    order: 80,
    keywords: ['duplicates', 'merge', 'domain', 'company suggestion', 'preferences'],
    component: CrmSettingsSurface,
  },
  {
    key: 'crm.meeting-links',
    title: 'Booking links',
    module: 'crm',
    icon: faCalendarClock,
    section: 'Setting up',
    order: 70,
    keywords: ['meeting', 'calendar', 'schedule a call', 'meet'],
    component: MeetingLinksSurface,
  },
  /* ── Tenant-invented objects (docs/144 §3.6) ───────────────────────────── */
  //
  // ONE list surface and ONE detail surface for EVERY custom object a tenant
  // declares, parameterised by the object key in the pane's params. The
  // alternative — a registry entry minted per object — cannot work: the objects
  // are created at runtime by tenants, and the catalog is a static array
  // evaluated at module load.
  //
  // The launcher entries for each one are added dynamically instead, from the
  // object registry (see `useCustomObjectSurfaces`). These two are unlisted, in
  // the same way every detail pane is.
  {
    key: 'crm.records.list',
    title: 'Records',
    module: 'crm',
    icon: faTable,
    component: RecordsListSurface,
    listed: false,
  },
  {
    key: 'crm.record.detail',
    title: 'Record',
    module: 'crm',
    icon: faTable,
    component: RecordDetailSurface,
    listed: false,
  },

  /* ── People ────────────────────────────────────────────────────────────── */
  {
    key: 'crm.customers.list',
    title: 'Customers',
    module: 'crm',
    icon: faUsers,
    section: 'People',
    order: 10,
    keywords: ['contacts', 'buyers', 'clients'],
    component: CustomersListSurface,
    createSurface: 'crm.customer.detail',
    createLabel: 'Add a customer',
  },
  {
    key: 'crm.customer.detail',
    title: 'Customer',
    module: 'crm',
    icon: faUsers,
    component: CustomerDetailSurface,
    // Opened from the list ({id:'new'} to add, {id} to manage). Adding one is
    // the same surface as managing one, so it is a pane, not a launcher entry.
    listed: false,
  },
  {
    key: 'crm.accounts.list',
    title: 'Companies',
    module: 'crm',
    icon: faBuilding,
    section: 'People',
    order: 11,
    keywords: ['companies', 'organizations', 'organisations', 'b2b', 'trade', 'accounts', 'firms'],
    component: CompaniesListSurface,
    createSurface: 'crm.account.detail',
    createLabel: 'Add a company',
  },
  {
    key: 'crm.account.detail',
    title: 'Company',
    module: 'crm',
    icon: faBuilding,
    component: CompanyDetailSurface,
    listed: false,
  },
  {
    key: 'crm.segments.list',
    title: 'Segments',
    module: 'crm',
    icon: faFilter,
    section: 'People',
    order: 12,
    keywords: ['groups', 'lists', 'audience'],
    component: SegmentsListSurface,
    createSurface: 'crm.segment.detail',
    createLabel: 'New segment',
  },
  {
    key: 'crm.segment.detail',
    title: 'Segment',
    module: 'crm',
    icon: faFilter,
    component: SegmentDetailSurface,
    listed: false,
  },
  {
    key: 'crm.duplicates.list',
    title: 'Duplicates',
    module: 'crm',
    icon: faCopy,
    section: 'People',
    order: 13,
    keywords: ['merge', 'cleanup', 'same person'],
    component: DuplicatesSurface,
  },

  /* ── Sales ─────────────────────────────────────────────────────────────── */
  {
    key: 'crm.deals.list',
    title: 'Deals',
    module: 'crm',
    icon: faBullseye,
    section: 'Sales',
    order: 20,
    keywords: ['pipeline', 'opportunities'],
    component: DealsListSurface,
    createSurface: 'crm.deal.detail',
    createLabel: 'New deal',
  },
  {
    key: 'crm.deal.detail',
    title: 'Deal',
    module: 'crm',
    icon: faBullseye,
    component: DealDetailSurface,
    listed: false,
  },
  {
    key: 'crm.pipelines.list',
    title: 'Pipelines',
    module: 'crm',
    icon: faDiagramProject,
    section: 'Sales',
    order: 21,
    keywords: ['stages', 'process'],
    component: PipelinesListSurface,
    createSurface: 'crm.pipeline.detail',
    createLabel: 'New pipeline',
  },
  {
    key: 'crm.pipeline.detail',
    title: 'Pipeline',
    module: 'crm',
    icon: faDiagramProject,
    component: PipelineDetailSurface,
    listed: false,
  },
  {
    key: 'crm.tasks.list',
    title: 'Tasks',
    module: 'crm',
    icon: faListCheck,
    section: 'Sales',
    order: 22,
    keywords: ['todo', 'follow up', 'reminders'],
    component: TasksListSurface,
    createSurface: 'crm.task.detail',
    createLabel: 'New task',
  },
  {
    key: 'crm.task.detail',
    title: 'Task',
    module: 'crm',
    icon: faListCheck,
    component: TaskDetailSurface,
    listed: false,
  },
  {
    key: 'crm.orders.list',
    title: 'Customer orders',
    module: 'crm',
    icon: faReceipt,
    section: 'Sales',
    order: 23,
    keywords: ['history', 'purchases'],
    // Commerce order data seen from the CRM side — reuses the commerce order data
    // layer and opens the real order detail. Wears the Commerce hue.
    component: CustomerOrdersSurface,
  },

  /* ── Support ───────────────────────────────────────────────────────────── */
  //
  // Its own section, not a corner of Sales. A request is somebody asking for
  // help, which is a different job from working a deal, and the person doing it
  // is often not the person selling.
  {
    key: 'crm.tickets.list',
    title: 'Requests',
    module: 'crm',
    icon: faLifeRing,
    section: 'Support',
    order: 25,
    // What someone types when they are looking for this, which is rarely the
    // word we chose for it — "tickets", "helpdesk", and the thing they are
    // actually worried about ("overdue", "sla").
    keywords: [
      'tickets',
      'support',
      'helpdesk',
      'service',
      'issues',
      'complaints',
      'sla',
      'overdue',
    ],
    component: TicketsListSurface,
    createSurface: 'crm.ticket.detail',
    createLabel: 'New request',
  },
  {
    key: 'crm.ticket.detail',
    title: 'Request',
    module: 'crm',
    icon: faLifeRing,
    component: TicketDetailSurface,
    // Opening one is the same surface as working one ({id:'new'} → {id}), so it
    // is a pane rather than a launcher entry.
    listed: false,
  },
  {
    key: 'crm.sla-policies',
    title: 'Response times',
    module: 'crm',
    icon: faClock,
    section: 'Support',
    order: 26,
    keywords: [
      'sla',
      'response time',
      'business hours',
      'opening hours',
      'targets',
      'promise',
      'reply time',
    ],
    component: SlaPoliciesSurface,
    // One promise per business — a second copy of this pane would show the same
    // thing and let two people save over each other.
    singleton: true,
  },

  /* ── Setting up ────────────────────────────────────────────────────────── */
  {
    key: 'crm.object-types.list',
    title: 'Record types',
    module: 'crm',
    icon: faBoxes,
    section: 'Setting up',
    order: 40,
    keywords: ['custom fields', 'extra details', 'properties', 'record types', 'schema'],
    component: ObjectTypesListSurface,
    createSurface: 'crm.object-type.detail',
    createLabel: 'New record type',
  },
  {
    key: 'crm.object-type.detail',
    title: 'Record type',
    module: 'crm',
    icon: faBoxes,
    component: ObjectTypeDetailSurface,
    // Adding one is the same surface as managing one ({key:'new'} → {key}), so
    // it is a pane rather than a launcher entry.
    listed: false,
  },
  // What a business writes once and sends a hundred times (docs/144 §5.4). TWO
  // entries, not one screen with a strip across the top: a whole message and a
  // paragraph you drop into one are different things, usually kept by different
  // people — and a strip inside a pane is a third layer of tabs in an app that
  // is already tabbed. Side by side is one drag away if somebody wants both.
  {
    key: 'crm.templates.list',
    title: 'Email templates',
    module: 'crm',
    icon: faFileText,
    section: 'Setting up',
    order: 45,
    // The words someone uses when they are tired of retyping the same email —
    // rarely the word we chose for it.
    keywords: [
      'template',
      'templates',
      'canned',
      'saved email',
      'boilerplate',
      'follow up email',
      'reply template',
    ],
    component: TemplatesListSurface,
    // A second copy would show the same library and let two people save over
    // each other's edit of one template.
    singleton: true,
  },
  {
    key: 'crm.snippets.list',
    title: 'Saved paragraphs',
    module: 'crm',
    icon: faQuoteLeft,
    section: 'Setting up',
    order: 46,
    keywords: [
      'snippet',
      'snippets',
      'shortcut',
      'saved text',
      'paragraph',
      'opening hours',
      'returns policy',
      'canned response',
    ],
    component: SnippetsListSurface,
    singleton: true,
  },
  {
    key: 'crm.mailboxes.list',
    title: 'Mailboxes',
    module: 'crm',
    icon: faMailbox,
    section: 'Setting up',
    order: 50,
    keywords: ['email', 'inbox', 'imap', 'connect email', 'gmail', 'outlook'],
    component: MailboxesListSurface,
    // One list of connected accounts — there is nothing per-instance to vary,
    // so a second copy would only ever show the same thing.
    singleton: true,
  },
  // Connecting one is its OWN pane rather than a form inside the list: it is
  // minutes of work with an app password fetched from another browser tab, so
  // it fails the modal test outright and must be somewhere the unsaved-work
  // guard can see it. Unlisted — you get here from the list, not the launcher.
  {
    key: 'crm.mailbox.connect',
    title: 'Connect a mailbox',
    module: 'crm',
    icon: faMailbox,
    component: MailboxConnectSurface,
    listed: false,
    // Two half-finished connections at once is a way to lose one of them.
    singleton: true,
  },
  {
    key: 'crm.phone-systems.list',
    title: 'Phone systems',
    module: 'crm',
    icon: faPhoneVolume,
    section: 'Setting up',
    order: 60,
    // What someone actually types when the Call button is missing — they search
    // for the thing they want to do ("click to call"), or for their vendor.
    keywords: [
      'phone',
      'calls',
      'calling',
      'click to call',
      'voice',
      'twilio',
      'connect phone',
      'caller id',
    ],
    component: PhoneSystemsListSurface,
    singleton: true,
  },
  // Same reasoning as the mailbox connector: an Account SID and an auth token
  // are fetched from the phone provider's dashboard in another tab.
  {
    key: 'crm.phone-system.connect',
    title: 'Connect a phone system',
    module: 'crm',
    icon: faPhoneVolume,
    component: PhoneSystemConnectSurface,
    listed: false,
    singleton: true,
  },

  /* ── Reporting ─────────────────────────────────────────────────────────── */
  {
    key: 'crm.reports',
    title: 'Reports',
    module: 'crm',
    icon: faChartColumn,
    section: 'Reporting',
    order: 30,
    keywords: ['analytics', 'retention', 'value'],
    // Each instance owns its own pipeline selection, so it is not a singleton.
    component: CrmReportsSurface,
  },

  // The report BUILDER (docs/144 §8) — distinct from "Reports" above, which is
  // the fixed set sparx computes. This is where a business answers the question
  // we did not think of.
  {
    key: 'crm.report.library',
    title: 'Build a report',
    module: 'crm',
    icon: faChartColumn,
    section: 'Reporting',
    order: 31,
    keywords: [
      'report',
      'build',
      'custom report',
      'chart',
      'graph',
      'breakdown',
      'count',
      'total',
      'how many',
    ],
    component: ReportsLibrarySurface,
    createSurface: 'crm.report.builder',
    createLabel: 'New report',
  },
  {
    key: 'crm.report.builder',
    title: 'Report',
    module: 'crm',
    icon: faChartColumn,
    component: ReportBuilderSurface,
    // Building one and editing one are the same surface ({id:'new'} -> {id}),
    // so it is a pane rather than a launcher entry.
    listed: false,
  },
  {
    key: 'crm.dashboards',
    title: 'Dashboards',
    module: 'crm',
    icon: faGauge,
    section: 'Reporting',
    order: 32,
    keywords: ['dashboard', 'board', 'overview', 'kpi', 'at a glance', 'home'],
    component: DashboardsSurface,
  },
  // Scoring (docs/144 §10) — sits under Customers rather than Reporting,
  // because it is not a report: it changes what every list of customers is
  // ordered by, which is a working setting, not an answer.
  {
    key: 'crm.scoring',
    title: 'Scoring',
    module: 'crm',
    icon: faGauge,
    section: 'Customers',
    order: 18,
    keywords: [
      'score',
      'scoring',
      'lead score',
      'deal health',
      'hot leads',
      'priority',
      'ranking',
      'who to call',
    ],
    component: ScoringSurface,
  },
  {
    key: 'crm.dashboard.detail',
    title: 'Dashboard',
    module: 'crm',
    icon: faGauge,
    // The same surface as above — it already reads `params.id` and falls back to
    // the landing board. This key exists so ONE board has its own address
    // (/crm/dashboards/:id) without two routes claiming one surface, which the
    // route table forbids. Unlisted: the launcher entry is "Dashboards".
    component: DashboardsSurface,
    listed: false,
  },
];
