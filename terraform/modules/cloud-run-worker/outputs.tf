output "service_name" {
  value = google_cloud_run_v2_service.this.name
}

output "service_uri" {
  value       = google_cloud_run_v2_service.this.uri
  description = "Public HTTPS URL of the Cloud Run service. IAM-protected — callers need roles/run.invoker."
}

output "subscription_name" {
  value = google_pubsub_subscription.push.name
}

output "subscription_id" {
  value = google_pubsub_subscription.push.id
}
