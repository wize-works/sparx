variable "secret_ids" {
  type        = list(string)
  description = "Secret IDs to create. Versions (the actual secret material) are added out-of-band via `gcloud secrets versions add`."
}
