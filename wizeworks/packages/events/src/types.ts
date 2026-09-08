// Event type registry — central list of every Pub/Sub event sparx publishes.
// Topic name == event type (per-topic + for_each Terraform pattern), so a
// publisher with a typed `EventType` cannot accidentally publish to a topic
// that hasn't been provisioned.
//
// Adding a new event:
//   1. Add the literal to `EventType` here.
//   2. Add the topic + subscribers in terraform/envs/prod/main.tf.
//   3. terraform apply.
//   4. Define a payload interface in the consumer-side worker (and import
//      it back here only if multiple publishers share the same payload).

export type EventType =
  // Platform / tenant lifecycle
  | 'tenant.created'
  // A tenant's own profile changed (name / contact email). Consumed by the
  // platform-crm-worker so sparx's own CRM board keeps calling a business by
  // the name it actually uses — the workspace name starts as a placeholder
  // ("Sam's workspace") and becomes the real one during onboarding.
  | 'tenant.updated'
  // A tenant's PLATFORM subscription moved (trial → paying, payment failed,
  // cancelled). Published by the Stripe billing webhook after reconciliation,
  // so consumers get the post-Stripe truth. Distinct from `subscription.*`,
  // which are a tenant's OWN customers' commerce subscriptions.
  | 'tenant.subscription.changed'
  // Module lifecycle (docs/82 §4 [ADD]). Published by api-rest when a tenant
  // toggles a module flag; consumed to seed module defaults (CRM pipeline +
  // segments, email default automations, automation system seeds) and to flip
  // the per-tenant module-gate cache. First-class bus topics — previously only
  // an in-process platform-bus event with no publisher.
  | 'module.activated'
  | 'module.deactivated'
  // Tenant blueprints (docs/54) — one-click marketplace template installs.
  //
  // There is no `template.install` COMMAND event: the installer is called
  // directly by api-rest, so a "please install" topic had no publisher and no
  // consumer for its whole life. Only the two OUTCOMES are real.
  | 'template.installed'
  | 'template.install_failed'
  // Content
  | 'content.entry.created'
  | 'content.entry.updated'
  | 'content.entry.published'
  | 'content.entry.scheduled'
  | 'content.entry.unpublished'
  | 'content.entry.deleted'
  // No `content.revision.created`. A revision is written on every save, so the
  // topic would be the noisiest on the bus and it never had a publisher OR a
  // consumer. `content.entry.updated` is the same moment, at the grain anything
  // downstream actually wants.
  | 'content_type.upserted'
  // Media
  | 'media.uploaded'
  | 'media.processed'
  | 'media.deleted'
  // Email
  | 'email.send'
  | 'email.domain.verified'
  // Webhooks / redirects
  | 'redirect.added'
  | 'redirect.changed'
  | 'redirect.removed'
  // ─── Site builder ───────────────────────────────────────────────────
  // A site's DRAFT became what visitors are served — a publish, or a rollback to
  // an earlier release. `cache-revalidation-worker` maps `builder.*` onto the
  // `builder:<slug>` tag, which is what the storefront's page/layout/frame/style
  // reads are tagged with.
  //
  // THESE HAD NO PUBLISHER, and the consumer side has been waiting for them: the
  // worker's `builder.` branch was written and the tag was already on every read,
  // but nothing ever emitted the event. That was harmless only because all 19
  // storefront routes are `force-dynamic` — nothing is cached, so nothing needs
  // purging. It becomes a data-loss-shaped bug the moment ISR is turned on
  // (roadmap slice 21): a publish would show nothing, and a ROLLBACK would leave
  // the broken page live, which is the exact failure a rollback exists to undo.
  // So the publisher lands FIRST, and ISR becomes a switch rather than a rewrite.
  | 'builder.published'
  | 'builder.rolled_back'
  // ─── Commerce ───────────────────────────────────────────────────────
  // Catalog
  | 'product.created'
  | 'product.updated'
  // A product transitions INTO the `active` (live) status — the "new product went
  // live" moment, distinct from the noisy `product.updated` that fires on every
  // edit. Emitted by publish() / bulk status→active / update→active. The social
  // module's "Announce new product" automation triggers on this (docs/133 §9).
  | 'product.published'
  | 'product.deleted'
  | 'variant.created'
  | 'variant.updated'
  | 'variant.deleted'
  // Markup recompute (docs/48 §8). A variant's cost moved (direct edit or a
  // dropship supplier sync) → the markup-recompute-worker re-derives the price
  // for variants bound to a markup rule. `price.recomputed` is emitted when the
  // new price is auto-applied; `price.recompute.staged` when it is queued for
  // human approval instead (a cost spike never silently reprices).
  | 'variant.cost.updated'
  | 'price.recomputed'
  | 'price.recompute.staged'
  // Inventory
  | 'inventory.adjusted'
  | 'inventory.low'
  | 'inventory.depleted'
  | 'inventory.count.completed'
  | 'inventory.transfer.shipped'
  | 'inventory.transfer.received'
  // A shelf-to-shelf move inside one location (docs/146 Phase 2). Changes no
  // location quantity, so nothing downstream should re-price or re-index — it is
  // published for automations that care WHERE stock is (out of quarantine, onto
  // the pick face) rather than how much there is.
  | 'inventory.bin.moved'
  // Inventory integrity (docs/146 Phase 1) — the ledger checking itself.
  // `reconciliation.drift` fires when a scheduled pass finds a level whose
  // recorded on-hand disagrees with Σ(movements.delta); `oversell.blocked`
  // fires on every refused or uncovered hold. Both are alarms, not bookkeeping:
  // nothing downstream mutates stock in response, it notifies a human.
  | 'inventory.reconciliation.drift'
  | 'inventory.oversell.blocked'
  // Picking + packing (docs/146 Phase 4). A walk was generated, a walk finished,
  // a box was sealed — and `pick.short`, which is the one that matters: a picker
  // could not find stock the system believed was there. Nothing downstream
  // mutates stock in response to any of them (the short pick already restored
  // and held the units itself); they exist so an automation can chase a walk that
  // has sat unassigned, or alert on a shelf that keeps coming up empty.
  | 'inventory.pick_list.created'
  | 'inventory.pick_list.completed'
  | 'inventory.pick.short'
  | 'inventory.package.packed'
  // Assembly (docs/146 Phase 6). A run finished: components left the shelf and a
  // finished thing arrived, with the cost settled from what actually went in.
  // Nothing downstream mutates stock in response — the completion already wrote
  // every movement itself — but it is the moment a made-to-stock business wants
  // to reprice, reindex, or tell someone the batch is ready.
  | 'inventory.assembly.completed'
  // Planning (docs/146 Phase 7). The nightly pass re-ranked the catalogue and
  // items moved between ABC/XYZ classes. Fired ONCE per sweep with the count and
  // the tallies — never per item, because a re-ranking after a busy quarter
  // moves hundreds and a few hundred notifications say nothing actionable. What
  // reacts to it is a count schedule (an item that became an A needs counting
  // more often) and anyone who asked to be told their attention list changed.
  | 'inventory.classification.changed'
  // Supplier performance (docs/146 Phase 8.3). A submitted purchase order has
  // passed the date it was due and nothing has arrived against it. Fired ONCE
  // per order, the first night it goes late — a nightly re-fire for an order
  // that is six weeks overdue is how alerting gets muted. Moving the expected
  // arrival date is a new promise, so it re-arms the alert. Nothing downstream
  // mutates stock: it notifies whoever placed the order, and it is the trigger a
  // business actually wants for "chase the supplier".
  | 'inventory.purchase_order.late'
  // Demand-side commitments (docs/146 Phase 9). A hold was taken that stock
  // could not cover, so somebody is owed units that do not exist yet. Fired at
  // the moment of the promise rather than by a sweep, because the thing that
  // reacts to it is a purchase decision — a buyer wants to know a customer is
  // waiting before tonight, not tomorrow. Carries no date: whether one can
  // honestly be promised is resolved separately, and often the answer is no.
  | 'inventory.backorder.created'
  // A delivery covered one or more waiting commitments, in queue order
  // (docs/146 Phase 9.2). One event per backorder filled, because each is a
  // different customer to tell. Emitted after the receipt transaction commits,
  // so the units are genuinely on the shelf before anyone is told they are.
  | 'inventory.backorder.allocated'
  // A dated lot has crossed into the nearest expiry horizon (docs/146 Phase
  // 9.8). Fired ONCE per lot as it enters the 30-day window, not nightly for
  // the whole month it spends there — the same muting logic as the late-order
  // alert. What reacts to it is a markdown, a promotion, or a write-off.
  | 'inventory.lot.expiring'
  // Cart + checkout
  | 'cart.created'
  | 'cart.updated'
  | 'cart.abandoned'
  | 'cart.recovered'
  | 'checkout.started'
  | 'checkout.completed'
  | 'checkout.expired'
  // Orders (Commerce-side fan-out; CRM still owns the row)
  | 'order.placed'
  | 'order.paid'
  | 'order.fulfilled'
  | 'order.delivered'
  | 'order.cancelled'
  | 'order.refunded'
  | 'order.payment_failed'
  // Payment lifecycle (emitted by the Stripe webhook handler after provider
  // confirmation, so consumers get the authoritative post-Stripe signal rather
  // than the optimistic checkout-complete signal).
  | 'payment.captured'
  | 'payment.failed'
  // Subscriptions
  | 'subscription.created'
  | 'subscription.renewed'
  | 'subscription.payment_failed'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.cancelled'
  // The renewal charge needs the cardholder to authenticate with their bank
  // (3-D Secure on a merchant-initiated charge). NOT a payment failure — the
  // card is good and the customer is willing, they just have to tap Confirm.
  // Its own event because the email has to ask for something different.
  | 'subscription.authentication_required'
  // The renewal was billed rather than charged: an order plus a payment link,
  // for a gateway that cannot hold a card on file and for accounts on terms
  // (docs/142 §8). An outstanding invoice is accounts receivable, so this is
  // deliberately not `payment_failed`.
  | 'subscription.invoiced'
  // Returns / RMA
  | 'return.requested'
  | 'return.approved'
  | 'return.received'
  | 'return.refunded'
  | 'return.exchanged'
  // Reviews + Q&A
  | 'review.submitted'
  | 'review.published'
  | 'review.flagged'
  | 'question.published'
  | 'question.answered'
  // Provider marketplace
  | 'provider.installed'
  | 'provider.uninstalled'
  | 'provider.health_changed'
  // Gift cards + account credit
  | 'giftcard.issued'
  | 'giftcard.redeemed'
  | 'accountcredit.granted'
  | 'accountcredit.spent'
  // Configurator
  | 'configuration.requested'
  | 'configuration.quoted'
  | 'configuration.accepted'
  // ─── Domains (docs/24) ──────────────────────────────────────────────
  // Emitted after a successful GoDaddy purchase + DNS configuration. The
  // domain-worker subscribes to poll DNS propagation and mark the domain active.
  | 'domain.purchased'
  // ─── B2B (docs/10, docs/64 Ph2-Ph3) ────────────────────────────────────
  // No `b2b.quote.submitted` / `b2b.quote.responded`. A quote is not a B2B
  // entity in this schema — it is a `BillingDocument` with `kind = 'quote'`, and
  // its lifecycle already publishes `crm.billing_document.created` /
  // `.finalized` / `.converted`, which the automation catalog offers as "A
  // quote, estimate or invoice is created". The b2b pair never had a publisher
  // because there was never anything for it to publish from.
  // Invoice / credit management notifications.
  | 'b2b.invoice.created'
  | 'b2b.invoice.overdue'
  | 'b2b.account.credit_hold'
  | 'b2b.account.suspended'
  // Approval workflow notifications (docs/64 B2B Ph6).
  | 'b2b.order.pending_approval'
  | 'b2b.order.approved'
  | 'b2b.order.rejected'
  // ─── Scheduling (docs/79) — the standalone booking module ──────────────
  // Booking lifecycle; the scheduling-worker consumes these to send
  // confirmations/reminders and the calendar-sync push.
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.rescheduled'
  | 'booking.cancelled'
  | 'booking.completed'
  | 'booking.no_show'
  // No `booking.reminder`. Reminders are a LEDGER, not an event: the booking
  // lifecycle writes `scheduling_booking_notifications` rows inside its own
  // transaction (dedupe + a dispatch audit trail), and api-rest's
  // `startBookingNotificationLoop` tick sends the due ones. That is a better
  // mechanism than a fire-and-forget topic, and the topic never had a publisher.
  | 'booking.waitlist_offered'
  // Calendar sync (docs/79 §8/§16): connection health + import outcomes.
  | 'calendar.connected'
  | 'calendar.sync_failed'
  // ─── Dropship (docs/14, docs/64 Ph1-Ph3) ───────────────────────────────
  | 'dropship.supplier.connected'
  | 'dropship.supplier.sync_started'
  | 'dropship.supplier.sync_completed'
  | 'dropship.supplier.error'
  | 'dropship.order.route'
  | 'dropship.order.submitted'
  | 'dropship.order.shipped'
  | 'dropship.order.delivered'
  | 'dropship.order.failed'
  // ─── Inventory Sync (docs/64 Inv Ph1) ──────────────────────────────────
  // Source lifecycle
  | 'inventory.source.created'
  | 'inventory.source.sync_started'
  | 'inventory.source.sync_completed'
  | 'inventory.source.error'
  // Freshness SLO (docs/146 Phase 1) — a source that has not reported inside its
  // declared window. Distinct from `.error`: the last sync SUCCEEDED, and that is
  // exactly what makes it dangerous — nothing looks broken while the number rots.
  | 'inventory.source.stale'
  | 'inventory.source.recovered'
  // Stock level mutations. `inventory.adjusted` above is the one that is
  // published and consumed (commerce-indexer re-projects on it); a second
  // `inventory.levels.updated` name for the same moment never had either.
  // ─── Universal search (docs/39) ─────────────────────────────────────
  // Generic indexing signal: any module emits this post-commit so the
  // commerce-indexer (re)projects ONE entity into the universal `entities`
  // collection. One topic serves every entity type — no per-entity topic.
  | 'search.entity.changed'
  // Admin-triggered full reindex of a tenant — consumed by commerce-indexer,
  // which bulk-projects the tenant's products/customers/orders into Typesense.
  | 'search.reindex.requested'
  // ─── Live Chat (docs/56, docs/69) ───────────────────────────────────
  // A customer message needs a human (AI disabled / escalated / outside
  // hours). Consumed by email-worker (notification fallback) + push-worker.
  | 'chat.message.received'
  // ─── Notifications ──────────────────────────────────────────────────
  // Web-push fan-out, one per recipient staff user, carrying the composed
  // { userId, title, body, url, tag }. Consumed by push-worker. Generic —
  // any module may publish it, mirroring `email.send`.
  | 'push.send'
  // ─── Import / Export (docs/68) ───────────────────────────────────────
  // Emitted by api-rest when a tenant submits a CSV import job. Consumed by
  // import-worker (Cloud Run) which processes rows and updates the job row.
  | 'import.job.created'
  // ─── In-product feedback (docs/112) ─────────────────────────────────
  // A dashboard user submitted feedback (idea / problem / question / praise).
  // Consumed for the admin-staff notification, analytics ingestion, and the
  // automation fan-in. Published by api-rest on POST /v1/me/feedback.
  | 'feedback.submitted'
  // WizeWorks staff responded to a submission (a reply or a notify-worthy
  // status change). Published by the admin app; consumed by email-worker
  // (the feedback-response email) + analytics. Defined here so the future
  // admin publisher shares the canonical name.
  | 'feedback.responded'
  // ─── Partner Program (docs/114 Part B) ──────────────────────────────
  // A public partner application arrived (informal auto-approved, or queued for
  // staff review). Topic-only for now — future consumer: staff notification.
  | 'partner.application.submitted'
  // A partner row went active (self-serve informal join or staff approval).
  | 'partner.activated'
  // A referral was credited at a referred org's signup (attribution hook).
  | 'partner.referral.created'
  // A commission accrued (a referred org's first payment cleared, or an ongoing
  // monthly period for a certified partner's managed account).
  | 'partner.commission.accrued'
  // A monthly payout run disbursed a partner via Stripe Connect.
  | 'partner.payout.paid'
  // ─── Bootcamps (docs/114 §B.5) ──────────────────────────────────────
  // A partner published / cancelled a bootcamp; future automation triggers.
  | 'bootcamp.published'
  | 'bootcamp.cancelled'
  // An attendee RSVP'd on-platform → a lead in the host partner's CRM.
  | 'bootcamp.registration.created'
  // ─── Site forms (docs/115) ──────────────────────────────────────────
  // A visitor submitted a Builder contact/lead form on a tenant site. The row is
  // stored synchronously by api-rest, which also publishes the owner-notification
  // and autoresponder as `email.send`; THIS event drives the CRM lead consumer
  // (upsert a prospect + log the message, gated on `crm`) + analytics + the
  // automation fan-in. Published by api-rest on POST /v1/public/forms/submit.
  | 'form.submitted'
  // ─── Social posting (docs/133, the `social` module) ─────────────────
  // A tenant connected / disconnected one of their own social accounts (Facebook
  // Page, Instagram, Threads, LinkedIn, Google Business Profile, …). Topic-only
  // for now; future consumers: analytics + a "reconnect" reminder on revoke.
  | 'social.connection.added'
  | 'social.connection.revoked'
  // A composed post entered the scheduled queue (published by api-rest when a
  // post is approved + scheduled). Topic-only — the scheduled DRAIN below is what
  // the worker consumes; this is the audit/automation hook.
  | 'social.post.scheduled'
  // The scheduled drain flipped a due post to `publishing` and is handing it to
  // the social-worker. Published by the api-rest scheduled-publish tick; CONSUMED
  // by social-worker (its pull subscription, wired in Slice 4). Keeps the heavy
  // per-platform publish I/O off the api-rest tick.
  | 'social.post.due'
  // A post finished publishing to every target (published by social-worker). The
  // hook other modules listen on — attribution, activity feed, a future metrics
  // pull. `social.post.failed` fires when every target failed (a partial success
  // stays a `social.post.published` with per-target errors on the row).
  | 'social.post.published'
  | 'social.post.failed'
  // Pull each published target's performance numbers (likes/comments/shares, and
  // reach/impressions where the scope allows) and snapshot them into
  // social_post_metrics. Consumed by social-worker; emitted after a publish and by the
  // Insights "Refresh" action (docs/implementation/social.md "Measure").
  | 'social.metrics.collect'
  // Check one connection's grant: refresh it ahead of expiry, or flip it to `expired`
  // when it can no longer be refreshed. Emitted by the api-rest health sweep tick,
  // CONSUMED by social-worker (the platform call is network I/O and belongs off the
  // tick). This is what turns a dead account into a visible "reconnect needed" BEFORE
  // a post is lost, rather than after — docs/social-audit GAP 1.
  | 'social.connection.check'
  // A grant stopped working and the tenant has to re-authorize. Published by the
  // social-worker when a refresh fails or a platform rejects the token. Consumed by
  // the notification fan-out; also the hook for the activity feed.
  | 'social.connection.expired'
  // Pull new comments / mentions / reviews / messages for one destination into the
  // engagement inbox. Emitted by the api-rest inbox sweep, consumed by social-worker.
  | 'social.inbox.sync'
  // Someone at the business replied to an inbox item; send that reply to the platform.
  // Emitted by api-rest when a reply is composed, consumed by social-worker.
  | 'social.inbox.reply'
  // ── Finance (docs/148) ────────────────────────────────────────────────────
  // Spend was recorded, however it got there — typed, generated from a recurring
  // template, imported, or derived. The profit rollup's invalidation trigger: the
  // day it lands on is now stale and gets recomputed.
  | 'finance.expense.recorded'
  // An expense's split across jobs changed, so job profitability is stale even
  // though the total spend did not move. A separate event because the rollup and
  // the job view invalidate on different things.
  | 'finance.expense.allocated'
  // The recurring generator's tick. Emitted by the api-rest scheduler, consumed by
  // finance-worker — generating rows is a write loop and belongs off the tick.
  | 'finance.recurring.due'
  // Recompute the profit rollup for a range. Emitted after spend changes and by
  // the Profit surface's manual refresh.
  | 'finance.profit.recompute'
  // A sync with the tenant's accounting system finished. Carries the outcome so a
  // `partial` or `failed` run can raise a notification — the failure that matters
  // is the 3 records out of 140 that bounced, not the whole run.
  | 'finance.accounting.sync.completed'
  // ── Staff (docs/149) ──────────────────────────────────────────────────────
  // A person joined the roster. The activity-feed hook, and what an automation
  // hangs an onboarding checklist off.
  | 'staff.member.created'
  // Timesheet time was APPROVED, and this is the labour deriver's trigger — not
  // clock-out. Approval is a deliberate act precisely so a mistyped shift cannot
  // move the month's profit before anyone has looked at it (docs/149 §5).
  | 'staff.time.approved'
  // A certification falls inside its reminder window, or has already lapsed.
  // Emitted by the nightly sweep, consumed to send the reminder — a licence that
  // expired is a van that cannot leave the yard, and nobody finds out from a
  // spreadsheet.
  | 'staff.certification.expiring'
  // A deal reached a `won` stage, ON THE PLATFORM BUS.
  //
  // `crm.deal.stage_changed` already exists and is the sanctioned stage-change
  // signal — but it is a `CrmTopic`, and the CRM bus does not reach an
  // in-process platform consumer (the two-bus footgun). staff-worker needs to
  // hear about a won deal to calculate commission, so the api-rest route that
  // moves a deal publishes this alongside the CRM one. Deliberately narrower
  // than `stage_changed`: only `won` is a payable moment, and a consumer that
  // had to re-derive "did this stage mean won" from a tenant-renamable stage
  // would get it wrong the first time somebody renamed "Won" to "Signed".
  | 'crm.deal.won'
  // Someone asked for time off, and someone answered. Two events rather than one
  // status-changed, because the approver and the requester are different people
  // and the notifications go in opposite directions.
  | 'staff.timeoff.requested'
  | 'staff.timeoff.decided'
  // ── Funnels (docs/151 §6.1) ───────────────────────────────────────────────
  // What lets an automation REACT to a campaign rather than only drive one. A
  // funnel already reads the same condition language automations do; these are
  // the other direction — "somebody reached the end of the spring promotion" is
  // a trigger a business wants, and without them a funnel is a report nobody can
  // act on until they open it.
  //
  // `funnel.entered` fires on the CAPTURE rung, not on a page view. Everything
  // above the capture line is anonymous and aggregate by design (docs/151 §4),
  // so there is no person for an event to be about — an entered event for a
  // pageview would either carry no subject or carry an identity the privacy
  // model refuses to hold.
  | 'funnel.entered'
  | 'funnel.converted'
  // Nobody DID anything, and that is the point: it is emitted by a sweep when a
  // subject has sat on a rung past the funnel's patience without moving. The
  // only one of the three with no request behind it, and the one that drives the
  // follow-up that recovers a sale.
  | 'funnel.abandoned';

/** Payload for `domain.purchased`. Consumed by the domain-worker to poll DNS
 *  propagation and mark the domain active once resolved (docs/24 §4 step 5). */
export interface DomainPurchasedPayload {
  /** The registered FQDN. */
  domain: string;
  /** GoDaddy order ID from the purchase API call. */
  orderId: string;
  /** The `domain_purchases.id` row inserted during the purchase flow. */
  purchaseId: string;
  /** The property this domain is attached to. */
  propertyId: string;
  /** True when configureDNS succeeded; false if DNS config failed (worker retries). */
  dnsConfigured: boolean;
}

/** Payload for `search.entity.changed`. `entityType` keys the projector
 *  registry; `op` distinguishes a reprojection from a removal. */
export interface SearchEntityChangedPayload {
  entityType: string;
  recordId: string;
  op: 'upsert' | 'delete';
}

/** Payload for `tenant.created`. Consumed by the legal-seed worker to seed a
 *  new tenant's starter legal pages + footer placements (docs/42 §3). The
 *  tenant id is on the envelope; slug/name are carried for logging + future
 *  consumers (e.g. welcome flows). */
export interface TenantCreatedPayload {
  slug: string;
  name: string;
}

/** Payload for `tenant.updated`. Consumed by the platform-crm-worker, which
 *  re-reads the tenant row rather than trusting the payload — the fields here
 *  are for logging and for consumers that only need to know WHAT changed. */
export interface TenantUpdatedPayload {
  slug: string;
  name: string;
  /** Field names that changed on this write (e.g. ['name']). */
  changed: string[];
}

/** Payload for `tenant.subscription.changed`. `status` is the tenant's platform
 *  subscription status after reconciliation (Stripe's vocabulary: trialing /
 *  active / past_due / unpaid / paused / canceled / …). `mrrCents` is the
 *  normalized MONTHLY recurring total across the subscription's items, so an
 *  annual plan reports its monthly equivalent. */
export interface TenantSubscriptionChangedPayload {
  status: string;
  mrrCents: number | null;
  currency: string | null;
}

export interface SparxEvent<T = unknown> {
  type: EventType;
  tenantId: string;
  actorId: string | null;
  /** ISO timestamp. */
  occurredAt: string;
  data: T;
}

// ────────────────────────────────────────────────────────────────────────
// Per-event payload contracts
//
// Payloads live here only when multiple publishers emit the same event
// (e.g. both api-rest and the dashboard publish email.send). Otherwise
// keep them inline in the publisher to avoid premature coupling.
// ────────────────────────────────────────────────────────────────────────

/**
 * Payload for `email.send`. Template-based — the worker resolves the
 * template id against @wizeworks/email's registry and renders before relay.
 *
 * `to` MUST be the recipient's verified address; the worker does no
 * enrichment lookup. For "send to userId" semantics, resolve at the
 * publish site.
 */
export interface EmailSendPayload {
  to: string;
  cc?: string;
  bcc?: string;
  /** Must match a registered template id in @wizeworks/email's TemplateSend. Tenant→
   *  customer emails (order/shipping/appointment) are Builder-authored and rendered
   *  by key (docs/93), so they are NOT template ids here. */
  template:
    | 'password-reset'
    | 'gated-delivery'
    | 'welcome-merchant'
    | 'partner-welcome'
    | 'email-verification'
    | 'domain-renewal-reminder'
    | 'chat-notification'
    | 'market-settlement-report'
    | 'feedback-response'
    | 'job-application-received'
    | 'job-application-confirmation'
    | 'team-invitation'
    | 'magic-link'
    | 'login-otp'
    | 'form-submission-notification'
    | 'form-submission-confirmation'
    | 'tool-result'
    | 'billing-receipt'
    | 'billing-payment-failed'
    | 'billing-trial-ending'
    | 'subscription-update'
    | 'domain-live'
    | 'domain-expired'
    | 'email-domain-verified'
    | 'document-signature-request'
    | 'invoice-sent'
    | 'invitation-accepted'
    | 'team-member-removed'
    | 'team-role-changed'
    | 'module-toggle'
    | 'partner-application-received'
    | 'partner-earnings'
    | 'password-changed'
    | 'two-factor-changed'
    | 'new-device-signin'
    | 'feedback-received'
    | 'social-post-failed'
    | 'social-connection-expired'
    | 'inventory-report';
  /** Shape is enforced by @wizeworks/email's TemplateSend.props on render. */
  props: Record<string, unknown>;
  /** Optional From override; defaults to SPARX_EMAIL_FROM env in worker. */
  from?: string;
  replyTo?: string;
  /** Optional header bag (X-Tenant-Id, List-Unsubscribe, etc.). */
  headers?: Record<string, string>;
}

/**
 * The OTHER `email.send` variant: a PRE-RENDERED (`kind:'raw'`) send. Tenant→customer
 * emails (booking/order/shipping/appointment) are Builder-authored and rendered by key
 * at dispatch (docs/93 §2), so they arrive at the worker as a finished body rather than
 * a template id + props. This MIRRORS email-worker's `RawSendSchema` (services/email-worker
 * handler.ts) — the worker is the source of truth for what it will deliver; keep the two
 * in sync. `to` is REQUIRED: a raw payload without it fails the worker's schema and is
 * silently acked/dropped (no send, no error) — the regression this type exists to make a
 * compile error. Publishers apply it via `satisfies RawEmailSendPayload`.
 */
export interface RawEmailSendPayload {
  kind: 'raw';
  /** The recipient's verified address. REQUIRED — see the note above. */
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /** Broadcast attribution id; opaque to the worker. */
  templateId?: string;
  /** Mailgun user-variables for webhook attribution (worker stamps tenant/property). */
  variables?: Record<string, string>;
  /** The site this send is on behalf of — stamped for per-site analytics (docs/49 Phase 7). */
  propertyId?: string | null;
}

/** Payload for `form.submitted`. Emitted by api-rest after a Builder contact/lead
 *  form on a tenant site is stored. The submitter fields are a snapshot (the form
 *  is anonymous — no customer/user id). `addToCrm` is resolved server-side from
 *  the form's saved config; the CRM consumer still checks the `crm` module gate,
 *  so a stale `true` on a since-disabled tenant is a safe no-op. Recipient
 *  addresses are deliberately NOT in this payload — the owner notification +
 *  autoresponder are published separately as `email.send` by the same handler,
 *  so routing targets never travel further than they must. */
export interface FormSubmittedPayload {
  submissionId: string;
  propertyId: string | null;
  formNodeId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  addToCrm: boolean;
}

/** Payload for `payment.captured`. Emitted by the Stripe webhook handler
 *  after `payment_intent.succeeded`; consumers can reliably treat this as
 *  "money in hand." */
export interface PaymentCapturedPayload {
  orderId: string;
  orderNumber: string;
  paymentRef: string;
  amountCents: number;
  currency: string;
  providerSlug: string;
}

/** Payload for `payment.failed`. Emitted by the Stripe webhook handler
 *  after `payment_intent.payment_failed`; downstream can notify the
 *  customer or restore an inventory reservation. */
export interface PaymentFailedPayload {
  orderId: string | null;
  paymentRef: string;
  failureCode: string | null;
  failureMessage: string | null;
  providerSlug: string;
}

/** Payload for `import.job.created`. Consumed by import-worker (Cloud Run) to
 *  process CSV rows and write per-row results back to import_job_rows. */
export interface ImportJobCreatedPayload {
  jobId: string;
  entityType: 'products' | 'customers' | 'b2b_accounts' | 'discounts';
}

/** Payload for `variant.cost.updated` (docs/48 §8). Two publishers emit it —
 *  the variant editor (`variant_cost` basis, on a direct cost edit) and the
 *  dropship catalog sync (`supplier_cost` basis) — so the contract lives here.
 *  The markup-recompute-worker re-reads live state to compute, so prev/new cost
 *  are advisory (for the staged-review display + logging), not the source of
 *  truth. `basis` tells the worker which cost dimension actually moved. */
export interface VariantCostUpdatedPayload {
  variantId: string;
  productId: string;
  basis: 'variant_cost' | 'supplier_cost';
  prevCostCents: number | null;
  newCostCents: number | null;
}

/** Payload for `feedback.submitted` (docs/112 §8). Published by api-rest when a
 *  dashboard user files feedback; consumed by the admin-staff notification,
 *  analytics ingestion, and the automation fan-in. The `context` is the captured
 *  client context (docs/112 §4) — kept opaque here so the contract doesn't bind
 *  to its exact shape. */
export interface FeedbackSubmittedPayload {
  submissionId: string;
  source: 'button' | 'pulse' | 'command';
  category: 'idea' | 'problem' | 'question' | 'praise';
  subject: string | null;
  sentiment: number | null;
  /** Resolved route module, for "which surface generates friction" rollups. */
  module: string | null;
  submitterEmail: string | null;
}

/** Payload for `feedback.responded` (docs/112 §8). Published by the admin app
 *  when staff reply or make a notify-worthy status change; consumed by
 *  email-worker (the feedback-response email) + analytics. */
export interface FeedbackRespondedPayload {
  submissionId: string;
  status: string;
  /** The staff reply body, when the response carried one (vs. a silent status flip). */
  messagePreview: string | null;
  recipientEmail: string;
}

/** Payload shared by `funnel.entered` / `funnel.converted` / `funnel.abandoned`
 *  (docs/151 §6.1). The tenant is on the envelope.
 *
 *  `subjectEmail` is present when the person is not (yet) a contact record —
 *  exactly one of it and `customerId` is set, the same exclusive-or the stage
 *  row and its CHECK constraint enforce. A consumer that needs to reach the
 *  person reads whichever is there; a consumer that needs to COUNT should read
 *  the funnel's own reporting rather than tallying these, because an event is a
 *  moment and the report is window-unique.
 *
 *  `valueCents` is only ever set on `funnel.converted`, and only when somebody
 *  can actually say what the conversion was worth. Null means unpriced, never
 *  zero — a funnel nobody has priced and a funnel priced at nothing are
 *  different facts. */
export interface FunnelStageEventPayload {
  funnelId: string;
  funnelName: string;
  propertyId: string;
  /** The rung's stable key, not its display name — a renamed stage keeps its
   *  history, and a consumer keyed on the label breaks the first time somebody
   *  edits it. */
  stageKey: string;
  /** What the rung DOES — `capture` on entered, `convert` on converted. Carried
   *  so a consumer can branch without re-reading the funnel's ladder, and so a
   *  future rung kind does not silently look like an existing one. */
  stageKind: string;
  customerId: string | null;
  subjectEmail: string | null;
  valueCents: number | null;
  /** Where this person came from, as frozen onto the stage row at capture. Same
   *  vocabulary as `site_analytics_events.source`. Null is common and honest. */
  entrySource: string | null;
  entryCampaign: string | null;
}
