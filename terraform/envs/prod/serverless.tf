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
  description  = "Runtime SA for the email-worker Cloud Run service. Reads Postal API key + DB URL from Secret Manager."
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
    SPARX_EMAIL_PROVIDER = "postal"
    SPARX_POSTAL_URL     = "https://postal.sparx.email"
    SPARX_EMAIL_FROM     = "Sparx <noreply@sparx.email>"
  }

  secrets = [
    {
      name      = "DATABASE_URL"
      secret_id = "database-url"
    },
    {
      name      = "SPARX_POSTAL_API_KEY"
      secret_id = "postal-api-key"
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
