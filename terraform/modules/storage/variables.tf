variable "media_bucket_name" {
  type = string
}

variable "location" {
  type        = string
  default     = "US"
  description = "Multi-region for media — served behind Cloudflare CDN."
}

variable "upload_origins" {
  type        = list(string)
  description = "Origins allowed to PUT directly to the media bucket via presigned URLs. Set to the dashboard host(s) — app.sparx.works in prod."
  default     = ["https://app.sparx.works"]
}
