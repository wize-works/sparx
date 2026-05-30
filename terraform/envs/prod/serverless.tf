# Serverless infrastructure — VPC Access Connector + per-worker runtime
# SAs + the shared Pub/Sub push invoker SA + Cloud Run worker services.
#
# Sized for Phase 1 traffic. The VPC connector is the only piece that
# carries an hourly cost regardless of traffic (~$10-15/mo at min throughput
# = 200Mbps); everything else is request-driven. See PR description for the
# cost-delta math.
#
# VPC layout (existing carve-up in modules/vpc):
#   10.0.0.0/20    nodes
#   10.0.16.0/20   services
#   10.0.32.0/20   PSA / Cloud SQL
#   10.0.128.0/17  pods
#
# Free range: 10.0.48.0/20 onwards. We carve a /28 for the serverless
# connector, leaving 10.0.48.16+ free for future serverless infrastructure
# (e.g. additional connectors per workload tier).

# ─── VPC Access Connector ─────────────────────────────────────────────────

resource "google_compute_subnetwork" "serverless_connector" {
  name          = "${local.name_prefix}-serverless-connector"
  ip_cidr_range = "10.0.48.0/28"
  region        = var.region
  network       = module.vpc.network_id

  # Connector throughput is bound by subnet size — /28 supports the default
  # 200Mbps-1000Mbps min/max range comfortably.
}

resource "google_vpc_access_connector" "workers" {
  name   = "${local.name_prefix}-workers"
  region = var.region

  subnet {
    name = google_compute_subnetwork.serverless_connector.name
  }

  # Throughput floor/ceiling. Default min is 200, max 1000. We can shrink
  # max later once traffic patterns are known — connector cost scales with
  # min_throughput.
  min_throughput = 200
  max_throughput = 300
}

# ─── Per-worker runtime service accounts ──────────────────────────────────
#
# Per-worker SAs (rather than reusing sparx-app) keep blast radius tight:
# email-worker can't read media buckets; media-worker can't read Postal
# credentials. The trade-off is more IAM resources to maintain — accept it
# for the worker tier, the in-cluster app tier still uses one shared SA.

resource "google_service_account" "email_worker" {
  account_id   = "sparx-email-worker"
  display_name = "Sparx email-worker (Cloud Run)"
  description  = "Runtime SA for the email-worker Cloud Run service. Reads Mailgun API key + DB URL from Secret Manager."
}

resource "google_project_iam_member" "email_worker_roles" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.email_worker.email}"
}

resource "google_service_account" "commerce_indexer" {
  account_id   = "sparx-commerce-indexer"
  display_name = "Sparx commerce-indexer (Cloud Run)"
  description  = "Runtime SA for the commerce-indexer Cloud Run service. Reads DB URL + Typesense API key from Secret Manager; reprojects product rows into Typesense."
}

resource "google_project_iam_member" "commerce_indexer_roles" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.commerce_indexer.email}"
}

resource "google_service_account" "media_worker" {
  account_id   = "sparx-media-worker"
  display_name = "Sparx media-worker (Cloud Run)"
  description  = "Runtime SA for the media-worker Cloud Run service. Reads originals from the private media bucket and writes variants to the public one."
}

resource "google_project_iam_member" "media_worker_roles" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.media_worker.email}"
}

# Bucket-scoped storage perms — narrower than project-wide objectAdmin so
# the worker SA cannot reach Terraform state buckets or media buckets that
# belong to other tenants in the future.
resource "google_storage_bucket_iam_member" "media_worker_buckets" {
  for_each = toset([
    module.storage.media_bucket_name,
    module.storage.media_public_bucket_name,
  ])
  bucket = each.key
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.media_worker.email}"
}

# ─── Shared Pub/Sub push invoker SA ───────────────────────────────────────
#
# Pub/Sub mints OIDC tokens as this SA when pushing to Cloud Run. Cloud Run
# checks roles/run.invoker on the destination service against this SA's
# email — those bindings live in the cloud-run-worker module. The Pub/Sub
# managed service agent needs serviceAccountTokenCreator on this SA so it
# can actually mint the tokens.

resource "google_service_account" "pubsub_invoker" {
  account_id   = "sparx-pubsub-invoker"
  display_name = "Sparx Pub/Sub → Cloud Run invoker"
  description  = "Identity Pub/Sub assumes when delivering push messages to Cloud Run workers. Has no project-level roles; only roles/run.invoker on individual Cloud Run services via the cloud-run-worker module."
}

# Pub/Sub's project-level service agent: `service-<project-number>@gcp-sa-pubsub.iam.gserviceaccount.com`.
# Granting it tokenCreator on the invoker SA lets it impersonate the SA
# when generating OIDC tokens for push delivery.
data "google_project" "this" {
  project_id = var.project_id
}

resource "google_service_account_iam_member" "pubsub_invoker_token_creator" {
  service_account_id = google_service_account.pubsub_invoker.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

# ─── Cloud Run workers ────────────────────────────────────────────────────
#
# Side-by-side cutover: each push subscription is named '<topic>.<worker>-cloudrun'
# so the existing pull subscription ('<topic>.<worker>') keeps running in
# the cluster during the transition. Once Cloud Run is verified for a
# stable week, a follow-up PR removes the pull sub from modules/pubsub
# and deletes the k8s/workers manifests.

module "email_worker_cloudrun" {
  source = "../../modules/cloud-run-worker"

  name       = "email-worker"
  project_id = var.project_id
  region     = var.region
  # Initial pin — CI updates the tag on every deploy. lifecycle.ignore_changes
  # in the module keeps TF plans clean afterwards.
  image                 = "${var.region}-docker.pkg.dev/${var.project_id}/sparx/email-worker:latest"
  service_account_email = google_service_account.email_worker.email
  vpc_connector_id      = google_vpc_access_connector.workers.id

  min_instance_count    = 0
  max_instance_count    = 10
  container_concurrency = 8
  cpu                   = "1"
  memory                = "512Mi"
  timeout_seconds       = 300

  env_vars = {
    NODE_ENV             = "production"
    SERVICE_NAME         = "email-worker"
    LOG_LEVEL            = "info"
    PUBSUB_INVOKER_SA    = google_service_account.pubsub_invoker.email
    SPARX_EMAIL_PROVIDER = "mailgun"
    SPARX_MAILGUN_DOMAIN = "sparx.email"
    SPARX_MAILGUN_REGION = "us"
    SPARX_EMAIL_FROM     = "Sparx <noreply@sparx.email>"
  }

  secrets = [
    {
      name      = "DATABASE_URL"
      secret_id = "database-url"
    },
    {
      name      = "SPARX_MAILGUN_API_KEY"
      secret_id = "mailgun-api-key"
    },
  ]

  pubsub_topic                 = "email.send"
  pubsub_subscription_name     = "email.send.email-worker-cloudrun"
  pubsub_invoker_sa_email      = google_service_account.pubsub_invoker.email
  pubsub_dead_letter_topic_id  = module.pubsub.dead_letter_topic == null ? null : "projects/${var.project_id}/topics/${module.pubsub.dead_letter_topic}"
  pubsub_max_delivery_attempts = 5

  depends_on = [
    module.pubsub,
    google_project_iam_member.email_worker_roles,
    google_service_account_iam_member.pubsub_invoker_token_creator,
  ]
}

module "media_worker_cloudrun" {
  source = "../../modules/cloud-run-worker"

  name                  = "media-worker"
  project_id            = var.project_id
  region                = var.region
  image                 = "${var.region}-docker.pkg.dev/${var.project_id}/sparx/media-worker:latest"
  service_account_email = google_service_account.media_worker.email
  vpc_connector_id      = google_vpc_access_connector.workers.id

  # sharp/libvips AVIF encodes are CPU-heavy — keep per-instance
  # concurrency at 2 (matches the old MAX_CONCURRENT) and let Cloud Run
  # scale horizontally.
  min_instance_count    = 0
  max_instance_count    = 10
  container_concurrency = 2
  cpu                   = "2"
  memory                = "1Gi"
  # ack_deadline is 120 to cover ~60s encodes + push round-trip; request
  # timeout has to be >= ack_deadline so Cloud Run doesn't kill the work
  # before Pub/Sub gives up on it.
  timeout_seconds = 540

  env_vars = {
    NODE_ENV                = "production"
    SERVICE_NAME            = "media-worker"
    LOG_LEVEL               = "info"
    PUBSUB_INVOKER_SA       = google_service_account.pubsub_invoker.email
    GCS_MEDIA_BUCKET        = module.storage.media_bucket_name
    GCS_MEDIA_PUBLIC_BUCKET = module.storage.media_public_bucket_name
  }

  secrets = [
    {
      name      = "DATABASE_URL"
      secret_id = "database-url"
    },
  ]

  pubsub_topic                 = "media.uploaded"
  pubsub_subscription_name     = "media.uploaded.media-worker-cloudrun"
  pubsub_ack_deadline_seconds  = 120
  pubsub_invoker_sa_email      = google_service_account.pubsub_invoker.email
  pubsub_dead_letter_topic_id  = module.pubsub.dead_letter_topic == null ? null : "projects/${var.project_id}/topics/${module.pubsub.dead_letter_topic}"
  pubsub_max_delivery_attempts = 5

  depends_on = [
    module.pubsub,
    google_project_iam_member.media_worker_roles,
    google_storage_bucket_iam_member.media_worker_buckets,
    google_service_account_iam_member.pubsub_invoker_token_creator,
  ]
}

# ─── commerce-indexer ─────────────────────────────────────────────────────
#
# Single Cloud Run service that fans in from product.*/variant.*/inventory.*
# topics. The primary subscription is product.created (chosen as the
# "canonical" one because every product first appears via it); the rest
# attach via additional_subscriptions on the same service. The router in
# services/commerce-indexer/src/handler.ts disambiguates by event.type.

module "commerce_indexer_cloudrun" {
  source = "../../modules/cloud-run-worker"

  name                  = "commerce-indexer"
  project_id            = var.project_id
  region                = var.region
  image                 = "${var.region}-docker.pkg.dev/${var.project_id}/sparx/commerce-indexer:latest"
  service_account_email = google_service_account.commerce_indexer.email
  vpc_connector_id      = google_vpc_access_connector.workers.id

  # Projection is light: one Prisma read + one HTTP upsert per event.
  # Container concurrency of 8 matches email-worker; bump if Typesense
  # round-trip becomes the floor.
  min_instance_count    = 0
  max_instance_count    = 10
  container_concurrency = 8
  cpu                   = "1"
  memory                = "512Mi"
  timeout_seconds       = 120

  env_vars = {
    NODE_ENV                = "production"
    SERVICE_NAME            = "commerce-indexer"
    LOG_LEVEL               = "info"
    PUBSUB_INVOKER_SA       = google_service_account.pubsub_invoker.email
    GCS_MEDIA_PUBLIC_BUCKET = module.storage.media_public_bucket_name
    # Typesense lives in-cluster (k8s Service); reach it via the VPC
    # connector. Hostname matches k8s/typesense/service.yaml.
    TYPESENSE_HOST     = "typesense.sparx-prod.svc.cluster.local"
    TYPESENSE_PORT     = "8108"
    TYPESENSE_PROTOCOL = "http"
    # Create the products/customers/orders collections on cold start if
    # they're missing (idempotent — ensureSchemas retrieves first, creates
    # only on 404). The Phase-1 typesense-api-key is the admin key, so it
    # has create rights. Makes a fresh Typesense self-heal on next boot.
    ENSURE_SCHEMAS_ON_BOOT = "true"
  }

  secrets = [
    {
      name      = "DATABASE_URL"
      secret_id = "database-url"
    },
    {
      name      = "TYPESENSE_API_KEY"
      secret_id = "typesense-api-key"
    },
  ]

  # Primary subscription = product.created. Inventory + variant + the rest
  # of the product lifecycle attach as additional subscriptions below.
  pubsub_topic                 = "product.created"
  pubsub_subscription_name     = "product.created.commerce-indexer-cloudrun"
  pubsub_invoker_sa_email      = google_service_account.pubsub_invoker.email
  pubsub_dead_letter_topic_id  = module.pubsub.dead_letter_topic == null ? null : "projects/${var.project_id}/topics/${module.pubsub.dead_letter_topic}"
  pubsub_max_delivery_attempts = 5

  additional_subscriptions = [
    { topic = "product.updated", subscription_name = "product.updated.commerce-indexer-cloudrun" },
    { topic = "product.deleted", subscription_name = "product.deleted.commerce-indexer-cloudrun" },
    { topic = "variant.created", subscription_name = "variant.created.commerce-indexer-cloudrun" },
    { topic = "variant.updated", subscription_name = "variant.updated.commerce-indexer-cloudrun" },
    { topic = "variant.deleted", subscription_name = "variant.deleted.commerce-indexer-cloudrun" },
    { topic = "inventory.adjusted", subscription_name = "inventory.adjusted.commerce-indexer-cloudrun" },
  ]

  depends_on = [
    module.pubsub,
    google_project_iam_member.commerce_indexer_roles,
    google_service_account_iam_member.pubsub_invoker_token_creator,
  ]
}
