output "media_bucket_name" {
  value       = google_storage_bucket.media.name
  description = "Private bucket — originals and any tenant-sensitive object."
}

output "media_bucket_url" {
  value = google_storage_bucket.media.url
}

output "media_public_bucket_name" {
  value       = google_storage_bucket.media_public.name
  description = "World-readable bucket — derived variants only."
}

output "media_public_bucket_url" {
  value = google_storage_bucket.media_public.url
}
