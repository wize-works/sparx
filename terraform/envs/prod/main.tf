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
  # Topic name == EventType in services/api-rest/src/lib/pubsub.ts. To add
  # a new event type:
  #   1. Add the literal to the EventType union in pubsub.ts
  #   2. Add the same string here with [] (no consumers yet) or a list
  #   3. New consumer worker? Add its name to the list and ship the worker
  #
  # Empty list = topic exists (publishable) but no subscriber yet — Phase 1
  # cost optimisation, since idle subscriptions still cost retention.
  topics = {
    # Commerce / orders
    "order.created" = ["worker-webhook"]
    "order.updated" = ["worker-webhook"]

    # CRM customers
    "customer.created" = ["worker-webhook"]
    "customer.updated" = ["worker-webhook"]

    # Cart
    "cart.abandoned" = []

    # Domains
    "domain.verified"  = ["worker-domain"]
    "domain.purchased" = ["worker-domain"]

    # Email
    "email.send"            = ["worker-email"]
    "email.domain.verified" = []

    # Module lifecycle
    "module.activated"   = []
    "module.deactivated" = []

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
    "redirect.removed" = []
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

  secret_ids = [
    "database-url",
    "redis-url",
    "better-auth-secret",
    "stripe-secret-key",
    "stripe-webhook-secret",
    "godaddy-api-key-ote",
    "godaddy-api-secret-ote",
    "godaddy-api-key-prod",
    "godaddy-api-secret-prod",
    "postal-api-key",
    "cloudflare-api-token",
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

# Storage access scoped to the media bucket only — NOT project-wide.
# (Project-wide objectAdmin would let the app SA write to the Terraform state bucket.)
resource "google_storage_bucket_iam_member" "app_media" {
  bucket = module.storage.media_bucket_name
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

module "monitoring" {
  source = "../../modules/monitoring"

  project_id               = var.project_id
  ops_email                = var.ops_email
  public_domains_active    = var.cloudflare_enabled
  uptime_check_hosts       = ["api.sparx.works", "app.sparx.works", "mcp.sparx.works"]
  dead_letter_subscription = "dead-letter-inspect"
}
