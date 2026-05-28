# Per-topic Pub/Sub. One google_pubsub_topic per key; for each (topic,
# subscriber) pair we generate one google_pubsub_subscription named
# "<topic>.<subscriber>". Subscribers only see the topics they're listed
# under — no shared/fan-out topic, no filtering inside worker code.
#
# Example:
#
#   topics = {
#     "order.created"  = ["webhook-worker", "email-worker"]
#     "media.uploaded" = ["media-worker"]
#     "domain.deleted" = []   # publishable but no consumer yet
#   }
#
# Adding a new consumer is a one-line change. Routing logic stays in
# Terraform, not in worker code.
variable "topics" {
  type        = map(list(string))
  description = "Map of topic name -> list of subscriber/consumer names."
}

variable "message_retention" {
  type        = string
  default     = "604800s"
  description = "Topic-level retention. 7 days = enough to replay through a weekend outage."
}

# Optional per-subscription tuning. Keyed by "<topic>.<subscriber>".
# Anything not listed here uses the defaults below.
variable "subscription_overrides" {
  type = map(object({
    ack_deadline_seconds       = optional(number, 60)
    message_retention_duration = optional(string, "604800s")
    use_dead_letter            = optional(bool, true)
    max_delivery_attempts      = optional(number, 5)
  }))
  default     = {}
  description = "Per-subscription overrides keyed by '<topic>.<subscriber>'."
}

variable "enable_dead_letter" {
  type        = bool
  default     = true
  description = "Create the dead-letter topic + inspect subscription. Subscriptions opt in via use_dead_letter (default true)."
}

variable "dead_letter_topic" {
  type    = string
  default = "dead-letter"
}
