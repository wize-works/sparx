variable "project_id" {
  type = string
}

variable "ops_email" {
  type        = string
  description = "Notification target. Use a group address (ops@sparx.works) not a personal one."
}

variable "public_domains_active" {
  type        = bool
  default     = false
  description = "Flip to true once Cloudflare DNS is live and api/app/mcp.sparx.works resolve."
}

variable "uptime_check_hosts" {
  type    = list(string)
  default = ["api.sparx.works", "app.sparx.works", "mcp.sparx.works"]
}

variable "dead_letter_subscription" {
  type        = string
  default     = ""
  description = "Name of the Pub/Sub dead-letter inspect subscription. Empty disables the DLQ alert."
}
