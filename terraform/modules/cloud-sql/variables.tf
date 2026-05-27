variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "network_id" {
  type        = string
  description = "VPC network self_link or id (for private IP)."
}

variable "tier" {
  type        = string
  default     = "db-g1-small"
  description = "Phase 1 default per docs/03-infrastructure-deployment.md. Upgrade trigger: connection exhaustion or query p95 > 500ms."
}

variable "edition" {
  type        = string
  default     = "ENTERPRISE"
  description = "Cloud SQL Postgres edition. ENTERPRISE supports the shared-core db-g1-small tier (~$25/mo). ENTERPRISE_PLUS requires db-perf-optimized-N-* (4x the cost) — switch in Phase 2 when SLAs warrant."
}

variable "availability_type" {
  type        = string
  default     = "ZONAL"
  description = "ZONAL for Phase 1. Switch to REGIONAL when enterprise SLAs land."
}

variable "disk_size_gb" {
  type    = number
  default = 10
}

variable "deletion_protection" {
  type    = bool
  default = true
}
