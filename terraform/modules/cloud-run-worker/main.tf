# Cloud Run-hosted Pub/Sub push worker.
#
# Pairs a google_cloud_run_v2_service with a push-mode google_pubsub_subscription
# pointed at it, and grants the configured invoker SA roles/run.invoker so
# Pub/Sub's OIDC-signed pushes actually reach the service.
#
# Ingress is left at the v2 default (INGRESS_TRAFFIC_ALL): the service URL
# is public, but IAM is required — only callers with roles/run.invoker can
# POST. INGRESS_TRAFFIC_INTERNAL_ONLY would block Pub/Sub push.
#
# Image lifecycle: TF pins the initial image, then CI bumps the tag on
# every deploy. lifecycle.ignore_changes on the image field keeps the
# next `terraform plan` quiet.

resource "google_cloud_run_v2_service" "this" {
  name     = var.name
  location = var.region
  project  = var.project_id

  deletion_protection = false

  template {
    service_account                  = var.service_account_email
    timeout                          = "${var.timeout_seconds}s"
    max_instance_request_concurrency = var.container_concurrency

    scaling {
      min_instance_count = var.min_instance_count
      max_instance_count = var.max_instance_count
    }

    vpc_access {
      connector = var.vpc_connector_id
      egress    = var.vpc_egress
    }

    containers {
      image = var.image

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        # cpu_idle = true (the default) means we only pay for CPU during
        # request handling — best fit for scale-to-zero workers.
      }

      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = { for s in var.secrets : s.name => s }
        content {
          name = env.value.name
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = env.value.version
            }
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      # CI bumps the image tag on every deploy. TF only owns the initial
      # pin + service config.
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

# Pub/Sub's OIDC-signed pushes hit a public URL but Cloud Run enforces IAM
# — the push subscription's oidc_token.service_account_email must have
# roles/run.invoker on this service. Without this binding, all pushes 403.
resource "google_cloud_run_v2_service_iam_member" "invoker" {
  project  = google_cloud_run_v2_service.this.project
  location = google_cloud_run_v2_service.this.location
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.pubsub_invoker_sa_email}"
}

resource "google_pubsub_subscription" "push" {
  name    = var.pubsub_subscription_name
  topic   = var.pubsub_topic
  project = var.project_id

  ack_deadline_seconds = var.pubsub_ack_deadline_seconds

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.this.uri}${var.pubsub_path}"

    oidc_token {
      service_account_email = var.pubsub_invoker_sa_email
      # Audience MUST match the Cloud Run service base URL. Default is the
      # push_endpoint, but we set it explicitly to the service URI so a
      # path change doesn't invalidate the token.
      audience = google_cloud_run_v2_service.this.uri
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dynamic "dead_letter_policy" {
    for_each = var.pubsub_dead_letter_topic_id == null ? [] : [1]
    content {
      dead_letter_topic     = var.pubsub_dead_letter_topic_id
      max_delivery_attempts = var.pubsub_max_delivery_attempts
    }
  }

  # Apply attribute filter only when set. Empty string is NOT the same as
  # absent — Pub/Sub rejects an empty filter expression.
  filter = var.pubsub_filter

  expiration_policy {
    ttl = ""
  }

  depends_on = [google_cloud_run_v2_service_iam_member.invoker]
}
