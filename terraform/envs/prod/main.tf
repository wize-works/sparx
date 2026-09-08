locals {
  name_prefix = "sparx-prod"
  env         = "prod"
}

module "vpc" {
  source = "../../modules/vpc"

  name_prefix = local.name_prefix
  region      = var.region

  # 10.0.0.0/16 carved up:
  #   10.0.0.0/20    — nodes (4096)
  #   10.0.16.0/20   — services (4096)
  #   10.0.32.0/20   — PSA / Cloud SQL (4096)
  #   10.0.128.0/17  — pods (32768) — Autopilot uses a lot
  subnet_cidr       = "10.0.0.0/20"
  services_cidr     = "10.0.16.0/20"
  psa_address       = "10.0.32.0"
  psa_prefix_length = 20
  pods_cidr         = "10.0.128.0/17"
}

module "gke" {
  source = "../../modules/gke"

  name_prefix         = local.name_prefix
  region              = var.region
  network_id          = module.vpc.network_id
  subnet_id           = module.vpc.subnet_id
  pods_range_name     = module.vpc.pods_range_name
  services_range_name = module.vpc.services_range_name
  master_cidr         = "172.16.0.0/28"
  deletion_protection = true
}

module "cloud_sql" {
  source = "../../modules/cloud-sql"

  name_prefix         = local.name_prefix
  region              = var.region
  network_id          = module.vpc.network_self_link
  tier                = "db-g1-small"
  availability_type   = "ZONAL"
  disk_size_gb        = 10
  deletion_protection = true

  # PSA peering must be live before Cloud SQL can allocate a private IP.
  depends_on = [module.vpc]
}

module "artifact_registry" {
  source = "../../modules/artifact-registry"
  region = var.region
}

module "pubsub" {
  source = "../../modules/pubsub"

  # Topic -> subscribers. One google_pubsub_topic per key; each subscriber
  # in the list gets a subscription named "<topic>.<subscriber>".
  #
  # Topic name == EventType in wizeworks/services/api-rest/src/lib/pubsub.ts. To add
  # a new event type:
  #   1. Add the literal to the EventType union in pubsub.ts
  #   2. Add the same string here with [] (no consumers yet) or a list
  #   3. New consumer worker? Add its name to the list and ship the worker
  #
  # Empty list = topic exists (publishable) but no subscriber yet — Phase 1
  # cost optimisation, since idle subscriptions still cost retention.
  topics = {
    # Platform / tenant lifecycle — signUpMerchant publishes tenant.created;
    # the legal-seed-worker AND the platform-crm-worker each consume it via
    # their own Cloud Run PUSH subscriptions in serverless.tf. Topic-only here
    # (empty list = no idle pull subscription).
    "tenant.created" = []
    # A tenant renamed itself / changed its contact email (PATCH /v1/tenant), and
    # its PLATFORM subscription moved (the Stripe billing webhook, after
    # reconciliation). Both feed sparx's own CRM board via the
    # platform-crm-worker's push subscriptions in serverless.tf (docs/140).
    # `tenant.subscription.changed` is the PLATFORM bill — distinct from the
    # `subscription.*` topics, which are a tenant's own customers' commerce
    # subscriptions.
    "tenant.updated"              = []
    "tenant.subscription.changed" = []

    # Commerce — catalog + inventory fan-in to commerce-indexer
    "product.created" = ["commerce-indexer"]
    "product.updated" = ["commerce-indexer"]
    # A product went live (draft→active). Topic-only: no idle pull subscription —
    # the automation engine's "Announce new product" trigger rides the publish()
    # tee to automation.trigger (docs/133 §9), and the search index already
    # re-projects off product.updated.
    "product.published"  = []
    "product.deleted"    = ["commerce-indexer"]
    "variant.created"    = ["commerce-indexer"]
    "variant.updated"    = ["commerce-indexer"]
    "variant.deleted"    = ["commerce-indexer"]
    "inventory.adjusted" = ["commerce-indexer"]
    "inventory.low"      = []
    "inventory.depleted" = []

    # Markup recompute (docs/48 §8) — a variant cost move (direct edit or dropship
    # sync) triggers a price recompute. markup-recompute-worker consumes
    # variant.cost.updated via its Cloud Run PUSH subscription in serverless.tf;
    # price.recomputed / price.recompute.staged are topic-only fan-out signals
    # (no idle pull subscription) for future notification + analytics consumers.
    "variant.cost.updated"   = []
    "price.recomputed"       = []
    "price.recompute.staged" = []

    # Search — admin-triggered full reindex. api-rest publishes; the
    # commerce-indexer consumes via its Cloud Run PUSH subscription declared
    # in serverless.tf (search.reindex.requested.commerce-indexer-cloudrun).
    # Empty list = topic only, no idle pull subscription.
    "search.reindex.requested" = []

    # Search — generic universal-index signal (docs/39). Any module publishes
    # `search.entity.changed` post-commit; the commerce-indexer re-projects the
    # one entity into the universal `entities` collection. One topic for every
    # entity type; consumed via the push subscription in serverless.tf.
    "search.entity.changed" = []

    # Commerce / orders — lifecycle events teed from the CRM platform bus to
    # Pub/Sub (wizeworks/packages/crm/src/pubsub-bridge.ts). commerce-indexer consumes
    # them via its Cloud Run PUSH subscriptions in serverless.tf; topic-only
    # here (empty list = no idle pull subscription).
    "order.created" = []
    # staff-worker: a paid order is when a commission is earned (docs/149 §10).
    "order.paid"             = ["staff-worker"]
    "order.cancelled"        = []
    "order.payment.recorded" = []
    "order.fulfilled"        = []
    "order.delivered"        = []
    # staff-worker: a refund reduces the commission proportionally.
    "order.refunded" = ["staff-worker"]

    # Commerce checkout — the "customer-facing checkout completed" signal,
    # DISTINCT from the CRM-bridged "order.created" above (that one fires when
    # the Order row is created; this one fires from checkout-service.complete()
    # once payment has cleared). dropship-worker consumes it via a Cloud Run
    # PUSH subscription in serverless.tf to route dropship line items to
    # suppliers; it's also the automation engine's "Order placed" trigger
    # (teed to automation.trigger by every publish() call). Found missing here
    # 2026-07-12 — checkout-service had been publishing to this topic since it
    # shipped, but the topic itself was never provisioned, so every
    # order.placed publish (and its automation-trigger tee) silently failed in
    # production.
    "order.placed" = []

    # CRM customers — the CRM bus (crm.customer.*) bridged to Pub/Sub.
    # commerce-indexer consumes via push subscriptions in serverless.tf.
    "crm.customer.created" = []
    "crm.customer.updated" = []
    "crm.customer.deleted" = []
    "crm.customer.merged"  = []

    # The REST of the CRM bus. `CrmTopic` in wizeworks/packages/crm/src/events.ts is a
    # SECOND event catalog, parallel to the `EventType` union in
    # wizeworks/packages/events/src/types.ts — every name below is published for real, but
    # only the four customer topics above had ever been provisioned. Found
    # 2026-07-24 when a live order logged
    # `publish failed … resource=crm.pipeline.created`, immediately after the
    # 66-topic backfill below — which diffed only the `EventType` union and so
    # could not see this catalog at all. Any drift check MUST cover both unions.
    "crm.customer.subscribed"        = []
    "crm.b2b_account.created"        = []
    "crm.b2b_account.updated"        = []
    "crm.pipeline.created"           = []
    "crm.pipeline.updated"           = []
    "crm.deal.created"               = []
    "crm.deal.updated"               = []
    "crm.deal.stage_changed"         = []
    "crm.deal.closed"                = []
    "crm.deal.order_attached"        = []
    "crm.deal.order_detached"        = []
    "crm.deal.document_attached"     = []
    "crm.deal.document_detached"     = []
    "crm.activity.recorded"          = []
    "crm.task.created"               = []
    "crm.task.updated"               = []
    "crm.task.completed"             = []
    "crm.segment.created"            = []
    "crm.segment.updated"            = []
    "crm.segment.entered"            = []
    "crm.segment.exited"             = []
    "crm.billing_document.converted" = []

    # Partner Program (docs/114 Part B) — topic-only fan-out (no idle pull
    # subscription yet); future consumers = staff notification + analytics +
    # the automation fan-in. api-rest publishes on partner activation, referral
    # credit, commission accrual, payout, and bootcamp lifecycle / RSVP.
    "partner.application.submitted" = []
    "partner.activated"             = []
    "partner.referral.created"      = []
    "partner.commission.accrued"    = []
    "partner.payout.paid"           = []
    "bootcamp.published"            = []
    "bootcamp.cancelled"            = []
    "bootcamp.registration.created" = []

    # Invoicing — authored billing documents (docs/87 §13). Published on the CRM
    # bus and teed to the automation fan-in + webhook fan-out via the standard
    # bridge. Topic-only (empty list = no idle pull subscription); a stage
    # transition is a prime automation trigger ("Repair Order reaches Approved").
    "crm.billing_document.created"       = []
    "crm.billing_document.stage_changed" = []
    "crm.billing_document.finalized"     = []
    "crm.billing_document.paid"          = []
    "crm.billing_document.voided"        = []

    # CRM parity (docs/144) — the object registry, associations and engagement.
    # Topic-only; every one of these is a prime automation trigger ("when a
    # contact is associated with a company", "when an inbound email lands on a
    # record"), and the webhook fan-out carries them to tenant integrations
    # through the same bridge as the rest of the CRM bus.
    "crm.object_def.created"  = []
    "crm.object_def.updated"  = []
    "crm.object_def.archived" = []
    "crm.record.created"      = []
    "crm.record.updated"      = []
    "crm.record.deleted"      = []
    "crm.property.changed"    = []
    "crm.association.added"   = []
    "crm.association.removed" = []
    "crm.engagement.logged"   = []
    "crm.engagement.sent"     = []
    "crm.engagement.received" = []

    # E-sign + meeting links (docs/144 §12). Three signature topics rather than
    # one with a status field, because a business wants to hear about them
    # differently — a request going out is routine, a signature is worth a
    # notification, and a decline is the one somebody should ring about today.
    "crm.document.signature_requested" = []
    "crm.document.signed"              = []
    "crm.document.declined"            = []
    "crm.meeting.booked"               = []

    # Service requests (docs/144 §7). Topic-only, like the rest of the CRM bus.
    # The two SLA topics are the reason the support clock is worth storing at
    # all: they are what a tenant hangs "tell the shift lead when an urgent
    # request is running out of time" off. Missing them would leave the sweep
    # marking rows in a table with nothing listening — which is how a promise
    # quietly becomes a column nobody reads.
    "crm.ticket.created"       = []
    "crm.ticket.updated"       = []
    "crm.ticket.assigned"      = []
    "crm.ticket.stage_changed" = []
    "crm.ticket.resolved"      = []
    "crm.ticket.sla.warning"   = []
    "crm.ticket.sla.breached"  = []

    # Cart
    "cart.abandoned" = []

    # Domains
    "domain.verified"  = ["worker-domain"]
    "domain.purchased" = ["worker-domain"]

    # Email
    "email.send"            = ["email-worker"]
    "email.domain.verified" = []

    # In-product feedback (docs/112). api-rest publishes feedback.submitted when a
    # dashboard user files feedback; the admin app publishes feedback.responded
    # when staff reply. Topic-only (empty list = no idle pull subscription) —
    # the staff notification + analytics consumers ride the automation fan-in /
    # future admin worker, and the response EMAIL goes via the email.send topic
    # above (the admin publisher composes the email.send payload directly).
    "feedback.submitted" = []
    "feedback.responded" = []

    # Site forms (docs/115). api-rest publishes form.submitted when a visitor
    # submits a Builder contact form. Topic-only (empty list = no idle pull
    # subscription) — the owner notification + autoresponder go via the email.send
    # topic above, and the CRM lead consumer runs in-process in api-rest (the event
    # is dual-published to the in-process bus). Webhooks + automation fan-in ride
    # the publish() tee.
    "form.submitted" = []

    # Web push (docs/69 A-6) — chat escalation fans out push.send per recipient;
    # push-worker (Cloud Run) delivers to staff browser subscriptions via VAPID.
    "push.send" = ["push-worker"]

    # Social posting (docs/133, the `social` module). api-rest publishes the
    # connection + lifecycle events; the scheduled-publish tick publishes
    # social.post.due for the social-worker to drain. Topic-only for now — the
    # social-worker pull subscription lands with the publish path in the build
    # plan (docs/134 Slice 4: "social.post.due" = ["social-worker"]). Analytics +
    # automation fan-in ride the publish() tee.
    "social.connection.added"   = []
    "social.connection.revoked" = []
    "social.post.scheduled"     = []
    "social.post.due"           = []
    "social.post.published"     = []
    "social.post.failed"        = []
    # Metrics pull (docs/implementation/social.md "Measure"): api-rest (refresh) +
    # the worker emit this; the social-worker's SECOND push subscription (serverless.tf)
    # consumes it and snapshots each published target's numbers.
    "social.metrics.collect" = []

    # Grant health + the engagement inbox (docs/social-audit). Each is an api-rest
    # tick that finds due work and hands the platform I/O to the social-worker via its
    # own push subscription (serverless.tf) — the same split as social.post.due.
    # `social.connection.expired` is topic-only: the notification fan-out rides the
    # publish() tee, and it is the activity-feed hook.
    "social.connection.check"   = []
    "social.connection.expired" = []
    "social.inbox.sync"         = []
    "social.inbox.reply"        = []

    # Finance (docs/148 §7). The spend ledger's invalidation path: recording or
    # re-splitting an expense dirties the day it sits on, and the finance-worker
    # recomputes that day's profit rollup. `finance.recurring.due` is an api-rest
    # tick that hands the write loop to the worker, the same split as
    # social.post.due. The worker is a handler inside wizeworks/services/event-worker (a
    # pull subscriber), so these carry no push subscription of their own.
    "finance.expense.recorded"  = []
    "finance.expense.allocated" = []
    "finance.recurring.due"     = []
    "finance.profit.recompute"  = []
    # Topic-only: the outcome of a sync with the tenant's accounting system. The
    # notification fan-out rides the publish() tee — a `partial` run is the one
    # anyone needs to see, because the failure that matters is the 3 records out
    # of 140 that bounced.
    "finance.accounting.sync.completed" = []

    # Staff (docs/149 §6). `staff.time.approved` is the one that does work: it is
    # the labour deriver's trigger, and the deriver is a handler inside
    # wizeworks/services/event-worker (a pull subscriber), so it carries no push
    # subscription of its own. The rest are topic-only — the notification fan-out
    # rides the publish() tee, and they are the activity-feed hooks.
    "staff.member.created"         = []
    "staff.time.approved"          = []
    "staff.certification.expiring" = []
    "staff.timeoff.requested"      = []
    "staff.timeoff.decided"        = []

    # Funnels (docs/151 §6.1). Topic-only: nothing consumes these directly, and
    # that is the point — they exist so an AUTOMATION can trigger on a campaign
    # rather than only drive one, and automations are reached through the
    # fan-in tee below rather than by a subscription of their own.
    #
    # `funnel.entered` fires on the CAPTURE rung, never on a page view: above
    # that line a funnel counts anonymous visits and has no person for an event
    # to be about (docs/151 §4).
    "funnel.entered"   = []
    "funnel.converted" = []
    "funnel.abandoned" = []

    # A won deal, on the PLATFORM bus. `crm.deal.stage_changed` is a CrmTopic and
    # never reaches an in-process consumer, so staff-worker could not hear about
    # a closed sale to commission it.
    "crm.deal.won" = ["staff-worker"]

    # Module lifecycle. Topic-only here: the platform-crm-worker consumes both
    # via Cloud Run PUSH subscriptions (serverless.tf) — the first activation is
    # what moves a tenant out of Trial on sparx's own signup board (docs/140).
    "module.activated"   = []
    "module.deactivated" = []

    # Automation fan-in (docs/82 §3.3). EVERY publish path tees a copy of each
    # event here after its per-type publish; the automation-worker is the sole
    # subscriber (a Cloud Run PUSH subscription in automation.tf, NOT a pull
    # subscriber listed here). One firehose topic + one subscription is cheaper
    # than N per-type subscriptions and additive — per-type topics stay for
    # targeted consumers. Topic-only here.
    "automation.trigger" = []

    # Stripe webhooks
    "stripe.webhook" = ["worker-billing"]

    # CMS content lifecycle (published by api-rest content routes)
    "content.entry.created"     = []
    "content.entry.updated"     = []
    "content.entry.published"   = []
    "content.entry.scheduled"   = []
    "content.entry.unpublished" = []
    "content.entry.deleted"     = []
    "content.revision.created"  = []
    "content_type.upserted"     = []

    # Media pipeline (api-rest publishes; media-worker consumes)
    "media.uploaded"  = ["media-worker"]
    "media.processed" = []
    "media.deleted"   = []

    # Redirects (Phase 4 — edge cache invalidation workers)
    "redirect.added"   = []
    "redirect.changed" = []
    "redirect.removed" = []

    # Site publish (api-rest publishes on publish + rollback). The intended
    # consumer is cache-revalidation-worker, which maps `builder.*` onto the
    # `builder:<slug>` cache tag — but that worker is not deployed yet (no
    # Cloud Run service, no k8s manifest), so these are topic-only. They exist
    # NOW because every storefront route is still `force-dynamic`: nothing is
    # cached, so a missing subscriber costs nothing, whereas a missing TOPIC
    # would make the publisher fail silently and leave the switch to ISR
    # looking fine right up until a rollback served a stale broken page.
    "builder.published"   = []
    "builder.rolled_back" = []

    # Dropship (docs/14). dropship-worker (Cloud Run) consumes
    # dropship.supplier.sync_started + dropship.order.route + order.placed via
    # its push subscriptions in serverless.tf — topic-only here (empty list =
    # no idle pull subscription). The remaining dropship.* topics are ones the
    # worker PUBLISHES (sync/order-routing outcomes); topic-only until a
    # notification/analytics consumer subscribes. Found entirely missing
    # 2026-07-12 — dropship-worker's code was fully built but never deployed,
    # so no dropship.* topic existed at all; every publish call had been
    # silently failing.
    "dropship.supplier.connected"      = []
    "dropship.supplier.sync_started"   = []
    "dropship.supplier.sync_completed" = []
    "dropship.supplier.error"          = []
    "dropship.order.route"             = []
    "dropship.order.submitted"         = []
    "dropship.order.shipped"           = []
    "dropship.order.delivered"         = []
    "dropship.order.failed"            = []

    # ── Catalog reconciliation, 2026-07-24 ──────────────────────────────────
    # The SAME failure as the dropship + order.placed notes above, found again
    # during the payments E2E: this map had drifted from the EventType union in
    # wizeworks/packages/events/src/types.ts, so 66 of its 134 event types had no topic and
    # every publish to them failed with `5 NOT_FOUND: Resource not found`. It is
    # caught + logged (publishes are best-effort, so nothing breaks user-visibly)
    # which is exactly why it went unnoticed — the money still moved, but every
    # downstream consumer got nothing. Seen live as
    # `pubsub: publish failed … resource=payment.captured` on a real paid order.
    #
    # All topic-only (`[]`): a topic costs nothing to exist; only SUBSCRIPTIONS
    # carry retention cost, so this restores publishability with no spend. Add a
    # subscriber to a list here when its worker actually ships.
    #
    # Keep this map in lockstep with the EventType union — a type declared there
    # but missing here fails silently in production.

    # Commerce funnel — cart + checkout lifecycle (checkout-service publishes
    # these on every session; `checkout.completed` fires on every order placed).
    "cart.created"       = []
    "cart.updated"       = []
    "cart.recovered"     = []
    "checkout.started"   = []
    "checkout.completed" = []
    "checkout.expired"   = []

    # Payments — the gateway-neutral capture/failure signals from the payment
    # webhook reconciler (docs/94 ADR §10). `order.paid` above is the CRM-side
    # twin; these carry the processor detail.
    "payment.captured"     = []
    "payment.failed"       = []
    "order.payment_failed" = []

    # Store credit + gift cards
    "accountcredit.granted" = []
    "accountcredit.spent"   = []
    "giftcard.issued"       = []
    "giftcard.redeemed"     = []

    # Returns / RMA
    "return.requested" = []
    "return.approved"  = []
    "return.received"  = []
    "return.refunded"  = []
    "return.exchanged" = []

    # Customer-generated content — reviews + product questions
    "review.submitted"   = []
    "review.published"   = []
    "review.flagged"     = []
    "question.answered"  = []
    "question.published" = []

    # Subscriptions / recurring billing
    "subscription.created"        = []
    "subscription.renewed"        = []
    "subscription.paused"         = []
    "subscription.resumed"        = []
    "subscription.cancelled"      = []
    "subscription.payment_failed" = []
    # The two collection outcomes that are NOT failures (docs/142 §8, §5.3): a
    # renewal billed by invoice rather than charged, and one where the issuer
    # wants the cardholder to authenticate. Each dispatches its own tenant-authored
    # email via a system automation, so a missing topic here means the customer is
    # never told — silently, because publishes to an unprovisioned topic do not
    # raise.
    "subscription.authentication_required" = []
    "subscription.invoiced"                = []

    # B2B — quotes, approval workflow, AR, account standing
    "b2b.quote.submitted"        = []
    "b2b.quote.responded"        = []
    "b2b.order.pending_approval" = []
    "b2b.order.approved"         = []
    "b2b.order.rejected"         = []
    "b2b.invoice.created"        = []
    "b2b.invoice.overdue"        = []
    "b2b.account.credit_hold"    = []
    "b2b.account.suspended"      = []

    # Scheduling — bookings + connected calendars (docs/79)
    "booking.created"          = []
    "booking.confirmed"        = []
    "booking.rescheduled"      = []
    "booking.cancelled"        = []
    "booking.completed"        = []
    "booking.no_show"          = []
    "booking.reminder"         = []
    "booking.waitlist_offered" = []
    "calendar.connected"       = []
    "calendar.sync_failed"     = []

    # Product configurator (quote-to-order)
    "configuration.requested" = []
    "configuration.quoted"    = []
    "configuration.accepted"  = []

    # Inventory — counts, transfers, and external stock sources
    "inventory.levels.updated"        = []
    "inventory.count.completed"       = []
    "inventory.transfer.shipped"      = []
    "inventory.transfer.received"     = []
    "inventory.source.created"        = []
    "inventory.source.sync_started"   = []
    "inventory.source.sync_completed" = []
    "inventory.source.error"          = []

    # Inventory integrity (docs/146 Phase 1) — the ledger checking itself, and
    # the feed-freshness SLO. All four are alarms consumed by notifications and
    # tenant automations; nothing downstream mutates stock in response.
    "inventory.bin.moved"            = []
    "inventory.reconciliation.drift" = []
    "inventory.oversell.blocked"     = []
    "inventory.source.stale"         = []
    "inventory.source.recovered"     = []

    # Picking + packing (docs/146 Phase 4). No subscribers: the short pick has
    # already restored and held its own units, so nothing downstream may touch
    # stock. These exist for tenant automations — chase an unassigned walk, alert
    # on a shelf that keeps coming up empty.
    "inventory.pick_list.created"   = []
    "inventory.pick_list.completed" = []
    "inventory.pick.short"          = []
    "inventory.package.packed"      = []

    # A build finished (docs/146 Phase 6). The completion wrote every movement
    # itself, so nothing downstream touches stock; this is the moment a
    # made-to-stock business reprices, reindexes, or tells someone it is ready.
    "inventory.assembly.completed" = []

    # The nightly planning pass re-ranked the catalogue and items moved between
    # ABC/XYZ classes (docs/146 Phase 7). One event per sweep with the tallies,
    # never one per item.
    "inventory.classification.changed" = []

    # A submitted purchase order passed the date it was due with nothing
    # received against it (docs/146 Phase 8.3). Fired once per order, the first
    # night it goes late; moving the expected arrival date re-arms it.
    "inventory.purchase_order.late" = []

    # Demand-side commitments (docs/146 Phase 9) — somebody is owed units that
    # do not exist yet, a delivery covered one of those commitments, and a dated
    # lot crossed into its nearest expiry horizon.
    "inventory.backorder.created"   = []
    "inventory.backorder.allocated" = []
    "inventory.lot.expiring"        = []

    # Integration providers, blueprint/template installs, imports, chat
    "provider.installed"      = []
    "provider.uninstalled"    = []
    "provider.health_changed" = []
    "template.install"        = []
    "template.installed"      = []
    "template.install_failed" = []
    "import.job.created"      = []
    "chat.message.received"   = []
  }

  # Per-subscription tuning. Anything not listed here uses the module
  # defaults (60s ack, 7d retention, DLQ after 5 attempts).
  subscription_overrides = {
    # Stripe webhooks can fan out to slow downstream calls.
    "stripe.webhook.worker-billing" = {
      ack_deadline_seconds  = 120
      max_delivery_attempts = 10
    }
    # sharp/libvips AVIF encodes on large originals can run ~60s.
    "media.uploaded.media-worker" = {
      ack_deadline_seconds = 120
    }
  }
}

module "secrets" {
  source = "../../modules/secrets"

  # Source of truth for app/platform secret CONTAINERS. Values are added
  # out-of-band (`gcloud secrets versions add`); the bootstrap workflow's KEYS
  # list syncs the k8s-app subset into the sparx-app-secrets Secret. Keep the two
  # in lockstep — a secret the app references but that's absent here (or from
  # KEYS) fails silently at runtime (the 2026-06-10 cron-token incident).
  # Still provisioned out-of-band, NOT yet reconciled here: sparx-db-app-password,
  # sparx-db-owner-password (DB setup), postal-* (decommissioned), mailgun SMTP creds.
  secret_ids = [
    "database-url",
    # Cloud-Run-only DATABASE_URL. Identical to `database-url` EXCEPT the host:
    # `database-url` points at the in-cluster PgBouncer kube-DNS name
    # (pgbouncer.sparx-prod.svc.cluster.local), which Cloud Run cannot resolve
    # over the VPC connector. This one points at the PgBouncer internal-LB IP
    # (google_compute_address.pgbouncer_internal = 10.0.0.55). The Cloud Run
    # worker fleet (serverless.tf + automation.tf) binds THIS secret; in-cluster
    # pods keep `database-url`. NOT synced into k8s sparx-app-secrets — it is
    # bound directly via Secret Manager → Cloud Run env, so it stays OUT of the
    # bootstrap KEYS list. Add the value out-of-band, host-swapped from the
    # existing secret so the password is never printed:
    #   gcloud secrets versions access latest --secret=database-url \
    #     | sed 's#@pgbouncer.sparx-prod.svc.cluster.local:5432#@10.0.0.55:5432#' \
    #     | gcloud secrets versions add database-url-cloudrun --data-file=-
    "database-url-cloudrun",
    "redis-url",
    "better-auth-secret",
    # Better Auth (Layer 2 shopper) — the customer instance runs inside api-rest
    # (docs/27 v2), isolated from the staff secret. Distinct value; add out-of-band
    # via `gcloud secrets versions add customer-auth-secret --data-file=-`.
    "customer-auth-secret",
    "stripe-secret-key",
    # Connect OAuth client id (`ca_…`) — DEAD CONFIG. The old "connect an existing
    # Standard account" OAuth onboarding was removed in favour of sparx Pay Express
    # Account Links (which need no client_id); `env.ts` keeps STRIPE_CLIENT_ID optional
    # and reads it NOWHERE. Kept here only so a still-provisioned secret doesn't drift;
    # safe to de-provision (remove from here + bootstrap KEYS) later. Do NOT wait on
    # Stripe issuing a live `ca_…` — no go-live step depends on it.
    "stripe-client-id",
    "stripe-webhook-secret",
    # Stripe webhook signing secrets — ONE PER ENDPOINT, and the code reads them by
    # endpoint-specific name, NOT the generic `stripe-webhook-secret` above:
    #   stripe-webhook-secret-sparx-pay → STRIPE_WEBHOOK_SECRET_SPARX_PAY, verifying
    #     POST /v1/public/webhooks/sparx-pay (the Connect destination-charge endpoint
    #     that flips an order to paid). While unset, that route logs a warning and
    #     200-ACKS WITHOUT PROCESSING — cards are charged, orders stay unpaid, and no
    #     confirmation email is sent. Silent, so it must be populated before go-live.
    #     Its value is a COMMA-SEPARATED LIST: that one URL is fed by TWO Stripe
    #     endpoints (account-scoped payment/charge events + the connected-account
    #     account.updated), each with its own whsec_, and a rolled secret overlaps
    #     for 24h. Put both in one secret version, comma-separated.
    #   stripe-webhook-secret-billing → STRIPE_WEBHOOK_SECRET_BILLING, verifying the
    #     platform module-billing endpoint (@wizeworks/billing). Same fail-silent shape.
    # Value comes from Stripe → Developers → Webhooks → <endpoint> → signing secret
    # (`whsec_…`), added out-of-band via `gcloud secrets versions add`.
    "stripe-webhook-secret-sparx-pay",
    "stripe-webhook-secret-billing",
    # Part A platform module-billing price ids (docs/92, docs/138 §5). Empty
    # containers created here; values are produced by `provision-stripe` (run with the
    # live key) and added out-of-band via `gcloud secrets versions add`. Creating them
    # in Terraform (not `gcloud secrets create`) keeps the next apply from 409-ing.
    # One per billable module × {monthly,annual} + managed hosting; read by priceIdFor()
    # and synced by the bootstrap KEYS list (missing-in-SM is warned, not failed).
    "stripe-price-builder-monthly",
    "stripe-price-builder-annual",
    "stripe-price-commerce-monthly",
    "stripe-price-commerce-annual",
    "stripe-price-cms-monthly",
    "stripe-price-cms-annual",
    "stripe-price-crm-monthly",
    "stripe-price-crm-annual",
    "stripe-price-email-monthly",
    "stripe-price-email-annual",
    "stripe-price-b2b-monthly",
    "stripe-price-b2b-annual",
    "stripe-price-ai-monthly",
    "stripe-price-ai-annual",
    "stripe-price-dropship-monthly",
    "stripe-price-dropship-annual",
    "stripe-price-inventory-monthly",
    "stripe-price-inventory-annual",
    "stripe-price-invoicing-monthly",
    "stripe-price-invoicing-annual",
    "stripe-price-chat-monthly",
    "stripe-price-chat-annual",
    "stripe-price-scheduling-monthly",
    "stripe-price-scheduling-annual",
    "stripe-price-managed-hosting-monthly",
    "godaddy-api-key-ote",
    "godaddy-api-secret-ote",
    "godaddy-api-key-prod",
    "godaddy-api-secret-prod",
    "postal-api-key",
    "cloudflare-api-token",
    # Better Auth (Layer 1 staff) — its own Postgres URL alongside the app DB.
    "auth-database-url",
    # Google OAuth (Better Auth social provider) — clientId/secret backing the
    # "Continue with Google" button. @wizeworks/auth (server.ts) registers the
    # provider only when BOTH are present, so the button stays inert until these
    # land. Redirect URI: ${BETTER_AUTH_URL}/api/auth/callback/google.
    "google-client-id",
    "google-client-secret",
    # ── Connector OAuth (Search Console · Google Calendar · Google Shopping) ──
    # A SEPARATE Google OAuth 2.0 *Web* client from the Better Auth social login
    # above. The connectors request read-only data scopes (Search Console's
    # webmasters.readonly, Calendar) and register per-app redirect URIs — e.g. the
    # workbench-hosted https://workbench.sparx.works/seo/search-console/callback —
    # whereas the social client only does staff sign-in at
    # ${BETTER_AUTH_URL}/api/auth/callback/google. api-rest reads this pair from
    # sparx-app-secrets as GOOGLE_OAUTH_CLIENT_ID / _SECRET; the connector stays
    # inert (isSearchConsoleConfigured() === false) until both land. Add the values
    # out-of-band once the client exists in the GCP console:
    #   gcloud secrets versions add google-oauth-client-id     --data-file=- <<< "<client id>"
    #   gcloud secrets versions add google-oauth-client-secret --data-file=- <<< "<client secret>"
    "google-oauth-client-id",
    "google-oauth-client-secret",
    # Search Console token-encryption key (docs/50 §7) — AES-256-GCM key encrypting
    # the stored GSC OAuth grant on search_console_connections. Bound by api-rest
    # (k8s) + the search-console-sync CronJob. Same pattern as channels-token-key /
    # provider-secret-key — generate + add a version now (it gates nothing else):
    #   gcloud secrets versions add search-console-token-key --data-file=- \
    #     <<< "$(openssl rand -base64 32)"
    "search-console-token-key",
    # Mailgun HTTP API key — the email-worker Cloud Run service binds it
    # (serverless.tf). Declared here so the TF that references it also owns it.
    "mailgun-api-key",
    # Mailgun HTTP webhook signing key → MAILGUN_WEBHOOK_SIGNING_KEY (bootstrap KEYS
    # uppercases the id). Read by api-rest's /v1/public/email/mailgun-webhook receiver
    # to verify the HMAC on Mailgun's delivery/engagement webhooks — WITHOUT it the
    # route accepts unverified (dev fallback), so populate before relying on the stats.
    # Value = Mailgun → Send → Webhooks → "HTTP webhook signing key"; add out-of-band:
    #   gcloud secrets versions add mailgun-webhook-signing-key --data-file=-
    "mailgun-webhook-signing-key",
    # Internal service-to-service shared secrets (docs/16 §2.5). api-rest and the
    # CronJob pods read these from sparx-app-secrets; values are machine-to-machine,
    # added out-of-band via `gcloud secrets versions add`.
    #   jwt         — signs dashboard→api-rest internal-trust JWTs
    #   acquisition — gates the cross-tenant acquisition report (docs/80 §10)
    #   cron        — auth for the /internal/crm/* + /internal/commerce/* CronJobs
    "sparx-internal-jwt-secret",
    "sparx-internal-acquisition-token",
    "sparx-internal-cron-token",
    # Typesense admin/search API key. commerce-indexer reads it via Secret
    # Manager → Cloud Run env binding. Rotated by the operator manually
    # (Typesense doesn't have rotation hooks).
    "typesense-api-key",
    # Typesense SEARCH-ONLY parent key. api-rest derives short-lived
    # tenant-scoped search keys from it (GET /v1/search/key) so the browser
    # can query Typesense directly without ever holding the admin key.
    # Provisioned out-of-band via the Typesense keys API; create with only
    # documents:search on products/customers/orders. Optional — the key
    # endpoint returns 501 until this is populated.
    "typesense-search-key",
    # VAPID private key — push-worker (serverless.tf) binds it to sign Web Push
    # requests. Generate the pair once (`npx web-push generate-vapid-keys`) and
    # add the private half out-of-band:
    #   gcloud secrets versions add vapid-private-key --data-file=- <<< "<priv>"
    # The PUBLIC half is non-secret: set it as var.vapid_public_key (worker env)
    # and VAPID_PUBLIC_KEY in k8s/sparx-prod/app-env-configmap.yaml (dashboard).
    "vapid-private-key",
    # Channel token-encryption key (docs/106 §4.6) — AES-256-GCM key encrypting the
    # per-tenant channel OAuth grants stored on channel_connections. Bound by the
    # channel-sync-worker (serverless.tf) AND api-rest (k8s). NOT gated on any
    # partner approval — generate + add a version now:
    #   gcloud secrets versions add channels-token-key --data-file=- \
    #     <<< "$(openssl rand -base64 32)"
    # The remaining per-channel platform OAuth client SECRETS (meta-app-secret,
    # pinterest-app-secret) land here when each partner app is approved — they
    # don't exist until then. (google-oauth-client-secret is now declared above —
    # the same shared Google Web client backs Search Console + Google Shopping.)
    "channels-token-key",
    # Social token-encryption key (docs/133 §5) — AES-256-GCM key encrypting the
    # per-tenant social-posting OAuth grants stored on social_connections. Bound by
    # the social-worker (serverless.tf) AND api-rest (k8s). DELIBERATELY SEPARATE from
    # channels-token-key (blast-radius isolation). NOT gated on any partner approval —
    # generate + add a version now:
    #   gcloud secrets versions add social-token-key --data-file=- \
    #     <<< "$(openssl rand -base64 32)"
    "social-token-key",
    # Per-platform social-posting OAuth apps (docs/133 §6, docs/134). Each platform's
    # id + secret; api-rest (k8s, sparx-app-secrets) reads them as e.g.
    # LINKEDIN_CLIENT_ID / _SECRET, and the social-worker binds the SECRET halves for
    # token refresh (serverless.tf) as each app is approved. CONTAINERS are declared
    # now (empty = free, no active version) so provisioning is a one-liner the instant
    # an app clears review; the platform stays coming_soon until BOTH halves land — no
    # code change. Google Business Profile + YouTube reuse google-oauth-client-id/_secret
    # (above); X is intentionally omitted (paid-tier posting API — no adapter until it's
    # committed). Add values out-of-band, e.g.:
    #   gcloud secrets versions add linkedin-client-secret --data-file=- <<< "<secret>"
    # LinkedIn org posts (Phase 1 — lightest approval).
    "linkedin-client-id",
    "linkedin-client-secret",
    # Meta (Phase 2) — Facebook Pages + Instagram share ONE app; Threads rides the same
    # verification but has its own app credentials. All gated on Meta App Review.
    "meta-app-id",
    "meta-app-secret",
    "threads-app-id",
    "threads-app-secret",
    # Pinterest + TikTok (Phase 3) — each its own app + content-API approval.
    "pinterest-app-id",
    "pinterest-app-secret",
    "tiktok-client-key",
    "tiktok-client-secret",
    # Provider-installation secret-encryption key (docs/09) — AES-256-GCM key
    # encrypting tenant-pasted provider credentials (e.g. a Shippo API token)
    # stored on provider_installations.configEncrypted. Bound by api-rest only
    # (wizeworks/packages/commerce/src/lib/secret-reader.ts). NOT gated on any partner
    # approval — generate + add a version now:
    #   gcloud secrets versions add provider-secret-key --data-file=- \
    #     <<< "$(openssl rand -base64 32)"
    # Rotating it invalidates every stored provider secret (tenants reconnect).
    "provider-secret-key",
    # WizeWorks operator console (docs/apps/admin/build-plan.md). Synced into the
    # `wize-admin-secrets` k8s Secret by bootstrap.yml (components=wize-admin), NOT
    # into sparx-app-secrets — EXCEPT `sparx-internal-operator-token`, which BOTH
    # api-rest (sparx-app-secrets) and the console (wize-admin-secrets) read.
    #   operator-database-url         — postgresql://wize_operator:<pw>@<privIP>:5432/sparx?schema=wize_admin
    #                                    Assemble out-of-band from `terraform output -raw
    #                                    cloud_sql_operator_password` + module.cloud_sql.private_ip.
    #   operator-auth-secret          — the operator Better Auth secret (DISTINCT from better-auth-secret).
    #   operator-bootstrap-password   — one-time password to seed operator #1 (rotate on first sign-in).
    #   sparx-internal-operator-token — Layer-5 shared secret gating /internal/operator/*.
    "operator-database-url",
    "operator-auth-secret",
    "operator-bootstrap-password",
    "sparx-internal-operator-token",
    # NOT listed here (their VALUES are TF-generated, not added out-of-band):
    #   admin-origin-cert / admin-origin-key — the admin.wize.works Cloudflare
    #   Origin CA cert + key. Container + version both live in origin-ca.tf;
    #   bootstrap.yml (components=caddy) syncs them into the caddy-admin-origin
    #   k8s TLS secret.
  ]
}

module "storage" {
  source            = "../../modules/storage"
  media_bucket_name = "${var.project_id}-${local.name_prefix}-media"
  location          = "US"
}

# Static IP for the ingress L4 LB. Created here so Cloudflare DNS can reference
# it before the k8s Service is applied. The Service annotates
# `loadBalancerIP: <this address>` to bind to it.
resource "google_compute_address" "ingress" {
  name         = "${local.name_prefix}-ingress"
  region       = var.region
  address_type = "EXTERNAL"
}

# Stable internal IP for the Typesense internal-LB Service. Typesense runs
# in-cluster as a ClusterIP (k8s/typesense/service.yaml) which in-cluster
# consumers use, but Cloud Run workers (commerce-indexer) reach the cluster
# only over the VPC connector — where kube-DNS names and ClusterIPs aren't
# routable. The internal LoadBalancer (k8s/typesense/service-internal.yaml)
# pins this address via `loadBalancerIP`, and the indexer's TYPESENSE_HOST
# (serverless.tf) points at it. Pulled from the node subnet's primary range.
resource "google_compute_address" "typesense_internal" {
  name         = "${local.name_prefix}-typesense-internal"
  region       = var.region
  address_type = "INTERNAL"
  subnetwork   = module.vpc.subnet_self_link
}

# Stable internal IP for the PgBouncer internal-LB Service. Same rationale as
# typesense_internal: in-cluster app pods reach the pooler over its ClusterIP /
# kube-DNS name, but the Cloud Run worker fleet reaches the cluster only over
# the VPC connector — where kube-DNS names and ClusterIPs aren't routable. The
# internal LoadBalancer (k8s/pgbouncer/service-internal.yaml) pins this address
# via `loadBalancerIP`, and the workers' DATABASE_URL (the `database-url-cloudrun`
# secret) points at it.
#
# Unlike typesense_internal, `address` is PINNED so the Terraform reservation and
# the k8s Service's loadBalancerIP are guaranteed to match (no manual reconcile).
# Pulled from the node subnet's primary range, one above the Typesense LB (.54).
resource "google_compute_address" "pgbouncer_internal" {
  name         = "${local.name_prefix}-pgbouncer-internal"
  region       = var.region
  address_type = "INTERNAL"
  subnetwork   = module.vpc.subnet_self_link
  address      = "10.0.0.55"
}

# Workload Identity GSA for application pods (apps + workers).
# Bound to the `sparx-app` KSA in the `sparx-prod` namespace.
resource "google_service_account" "app" {
  account_id   = "sparx-app"
  display_name = "Sparx application workloads"
  description  = "Used by api-rest, api-graphql, api-mcp, dashboard, storefront, and worker pods via Workload Identity."
}

resource "google_project_iam_member" "app_roles" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/pubsub.publisher",
    "roles/pubsub.subscriber",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app.email}"
}

# Storage access scoped to the media buckets only — NOT project-wide.
# (Project-wide objectAdmin would let the app SA write to the Terraform state bucket.)
# Both buckets get objectAdmin: api-rest writes originals to the private one,
# media-worker writes variants to the public one, and either may need to
# delete-and-replace on either bucket during reprocessing.
resource "google_storage_bucket_iam_member" "app_media" {
  for_each = toset([
    module.storage.media_bucket_name,
    module.storage.media_public_bucket_name,
  ])
  bucket = each.key
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app.email}"
}

resource "google_service_account_iam_binding" "app_workload_identity" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.workloadIdentityUser"
  members = [
    "serviceAccount:${var.project_id}.svc.id.goog[sparx-prod/sparx-app]",
    # db-migrate Job (k8s/sparx-prod/db-migrate-job.yaml) needs the same
    # Secret Manager + Cloud SQL access surface as app pods to bootstrap a
    # release. Reusing the app GSA keeps the IAM footprint flat — the
    # migrator only runs read-only against Secret Manager and connects to
    # Cloud SQL via the Auth Proxy sidecar.
    "serviceAccount:${var.project_id}.svc.id.goog[sparx-prod/sparx-db-migrator]",
  ]
}

# V4 signed-URL signing under Workload Identity. The app pods run with NO service
# account key file (Workload Identity mints tokens via the metadata server), so
# signing a GCS V4 URL routes through the IAM signBlob API — which requires the SA
# to hold serviceAccountTokenCreator on ITSELF. Without this, getSignedUrl() throws
# in prod, so the dashboard browser upload (POST /v1/media/uploads → presignPut) and
# the careers résumé signed-download link (presignGet) 500. (The public media
# resolver already sidesteps signing by piping bytes through api-rest, and the MCP
# proxied upload never signs — so those are unaffected either way.) Marginal blast
# radius: the SA already holds objectAdmin on both media buckets, so this only lets
# it mint time-boxed URLs to objects it can already read/write directly.
resource "google_service_account_iam_member" "app_self_sign" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.app.email}"
}

# Workload Identity GSA for the WizeWorks operator console (wizeworks/apps/admin), bound to
# the `wize-admin` KSA in the `wize-admin` namespace (docs/apps/admin/build-plan.md
# §2 D2). Deliberately minimal reach: its ONLY project role is Pub/Sub publisher
# (the operator set-password email.send). NO Cloud SQL IAM — it reaches the
# wize_admin schema over the VPC private IP with the wize_operator password; NO
# Secret Manager — envFrom injects its secrets. The smallest blast radius for a
# cross-tenant console (docs/16 §2.4): a compromised pod can neither read tenant
# business data directly nor mint tokens for other service accounts.
resource "google_service_account" "wize_admin" {
  account_id   = "wize-admin"
  display_name = "WizeWorks operator console"
  description  = "Used by wizeworks/apps/admin (wize-admin namespace) via Workload Identity. Pub/Sub publisher only."
}

resource "google_project_iam_member" "wize_admin_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.wize_admin.email}"
}

resource "google_service_account_iam_binding" "wize_admin_workload_identity" {
  service_account_id = google_service_account.wize_admin.name
  role               = "roles/iam.workloadIdentityUser"
  members = [
    "serviceAccount:${var.project_id}.svc.id.goog[wize-admin/wize-admin]",
  ]
}

module "monitoring" {
  source = "../../modules/monitoring"

  project_id               = var.project_id
  ops_email                = var.ops_email
  public_domains_active    = var.cloudflare_enabled
  uptime_check_hosts       = ["api.sparx.works", "app.sparx.works", "mcp.sparx.works", "mcp.sparx.zone"]
  dead_letter_subscription = "dead-letter-inspect"
}
