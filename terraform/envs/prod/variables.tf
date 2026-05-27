variable "project_id" {
  type        = string
  description = "GCP project ID for Sparx prod."
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare API token. Leave empty until domain transfers from GoDaddy complete."
}

variable "cloudflare_enabled" {
  type        = bool
  default     = false
  description = "Flip to true once sparx.works has been transferred to Cloudflare and var.cloudflare_api_token is set."
}

variable "ops_email" {
  type        = string
  description = "Notification target for Cloud Monitoring alerts. Use a group/distribution address."
  default     = "ops@sparx.works"
}
