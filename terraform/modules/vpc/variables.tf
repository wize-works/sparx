variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "subnet_cidr" {
  type        = string
  description = "Primary CIDR for nodes."
}

variable "pods_cidr" {
  type        = string
  description = "Secondary range for GKE pods."
}

variable "services_cidr" {
  type        = string
  description = "Secondary range for GKE services."
}

variable "psa_address" {
  type        = string
  description = "Starting address of the PSA range (for Cloud SQL private IP)."
}

variable "psa_prefix_length" {
  type        = number
  default     = 20
  description = "Prefix length of the PSA range."
}
