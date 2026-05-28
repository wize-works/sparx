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

# DKIM TXT value for postal._domainkey.sparx.email. Postal generates the
# key pair at `postal initialize` (first boot of the postal-web pod); after
# that, copy the TXT value out of Postal Admin → DNS Setup and either set
# this variable in your tfvars or replace the default below directly.
#
# Placeholder default lets the apply succeed before Postal is bootstrapped.
# Mail clients will see a malformed DKIM record and reject signatures
# until this is populated, which is fine — we're not sending yet.
variable "sparx_email_dkim_value" {
  type        = string
  default     = "v=DKIM1; k=rsa; p=PENDING_POSTAL_BOOTSTRAP"
  description = "DKIM TXT value for postal._domainkey.sparx.email. Populate after first Postal bootstrap."
}
