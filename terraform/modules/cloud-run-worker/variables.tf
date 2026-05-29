variable "name" {
  type        = string
  description = "Cloud Run service name. Also used as the worker's identity in logs."
}

variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "image" {
  type        = string
  description = "Full Artifact Registry image URL (host/path:tag). The first apply pins this; subsequent image bumps come from CI and are ignored by lifecycle.ignore_changes."
}

variable "service_account_email" {
  type        = string
  description = "Runtime service account email. Owns the DB/secret/GCS perms the worker needs at runtime — NOT the Pub/Sub push invoker SA."
}

variable "vpc_connector_id" {
  type        = string
  description = "Serverless VPC Access connector ID (projects/<p>/locations/<r>/connectors/<n>). Required so Cloud Run can reach Cloud SQL Auth Proxy / PgBouncer / Redis on the VPC."
}

variable "vpc_egress" {
  type        = string
  default     = "PRIVATE_RANGES_ONLY"
  description = "Cloud Run VPC egress mode. PRIVATE_RANGES_ONLY keeps public-internet traffic (Pub/Sub, GCS, Postal HTTPS) off the connector for cost; only RFC1918 traffic uses it."
}

variable "min_instance_count" {
  type        = number
  default     = 0
  description = "Scale-to-zero by default. Cold start ~1-2s for Node; bump for latency-sensitive workers."
}

variable "max_instance_count" {
  type    = number
  default = 10
}

variable "container_concurrency" {
  type        = number
  default     = 8
  description = "Replaces the worker's MAX_CONCURRENT. CPU-heavy workers (e.g. media transcoding) should set this to 1-2."
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "timeout_seconds" {
  type        = number
  default     = 300
  description = "Request timeout. Cloud Run hard ceiling is 3600. Must be >= pubsub_ack_deadline_seconds."
}

variable "container_port" {
  type    = number
  default = 8080
}

variable "env_vars" {
  type        = map(string)
  default     = {}
  description = "Plain (non-secret) env vars."
}

variable "secrets" {
  type = list(object({
    name      = string
    secret_id = string
    version   = optional(string, "latest")
  }))
  default     = []
  description = "Secret Manager references mounted as env. `secret_id` is the short name (resolved within project_id)."
}

# ── Pub/Sub push subscription ─────────────────────────────────────────────

variable "pubsub_topic" {
  type        = string
  description = "Name of the existing topic to subscribe to (e.g. 'email.send'). The topic must already be managed by the pubsub module."
}

variable "pubsub_subscription_name" {
  type        = string
  description = "Subscription name. Convention: '<topic>.<worker>-cloudrun' to coexist with the old pull subscription during cutover."
}

variable "pubsub_ack_deadline_seconds" {
  type    = number
  default = 60
}

variable "pubsub_invoker_sa_email" {
  type        = string
  description = "Service account Pub/Sub uses to mint OIDC tokens when pushing. Granted roles/run.invoker on this service. Typically shared across all Cloud Run workers (sparx-pubsub-invoker)."
}

variable "pubsub_dead_letter_topic_id" {
  type        = string
  default     = null
  description = "Dead-letter topic ID. Null to disable DLQ for this subscription."
}

variable "pubsub_max_delivery_attempts" {
  type    = number
  default = 5
}

variable "pubsub_filter" {
  type        = string
  default     = null
  description = "Optional Pub/Sub filter expression on message attributes (e.g. 'attributes.type = \"media.uploaded\"')."
}

variable "pubsub_path" {
  type        = string
  default     = "/"
  description = "HTTP path the push endpoint POSTs to."
}
