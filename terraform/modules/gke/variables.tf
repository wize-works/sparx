variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "network_id" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "pods_range_name" {
  type = string
}

variable "services_range_name" {
  type = string
}

variable "master_cidr" {
  type        = string
  default     = "172.16.0.0/28"
  description = "/28 outside the VPC for the GKE control plane."
}

variable "master_authorized_networks" {
  type = list(object({
    cidr = string
    name = string
  }))
  default     = []
  description = "CIDRs allowed to reach the public control plane. Empty = no restriction (still auth-gated)."
}

variable "deletion_protection" {
  type    = bool
  default = true
}
