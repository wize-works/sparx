variable "media_bucket_name" {
  type = string
}

variable "location" {
  type        = string
  default     = "US"
  description = "Multi-region for media — served behind Cloudflare CDN."
}
