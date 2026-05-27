variable "project_id" {
  type        = string
  description = "GCP project ID for Sparx."
}

variable "region" {
  type        = string
  default     = "us-central1"
  description = "Default GCP region."
}

variable "github_repo" {
  type        = string
  default     = "wize-works/sparx"
  description = "GitHub repo (owner/name) allowed to impersonate the deployer SA via OIDC."
}
