variable "topics" {
  type        = list(string)
  description = "Topic names per docs/02-architecture-overview.md §2."
}

variable "message_retention" {
  type        = string
  default     = "604800s"
  description = "Topic-level retention. 7 days = enough to replay through a weekend outage."
}

variable "subscriptions" {
  type = map(object({
    topic                      = string
    ack_deadline_seconds       = optional(number, 60)
    message_retention_duration = optional(string, "604800s")
    use_dead_letter            = optional(bool, true)
    max_delivery_attempts      = optional(number, 5)
  }))
  default     = {}
  description = "Keyed by subscription name (convention: <topic>.<consumer>). Topic must exist in var.topics."
}

variable "enable_dead_letter" {
  type        = bool
  default     = true
  description = "Create the dead-letter topic + inspect subscription. Subscriptions opt in via use_dead_letter."
}

variable "dead_letter_topic" {
  type    = string
  default = "dead-letter"
}
