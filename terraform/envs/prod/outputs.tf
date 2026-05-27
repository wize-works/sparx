output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "vpc_network" {
  value = module.vpc.network_name
}

output "gke_cluster_name" {
  value = module.gke.cluster_name
}

output "gke_cluster_location" {
  value = module.gke.cluster_location
}

output "gke_get_credentials_command" {
  value = "gcloud container clusters get-credentials ${module.gke.cluster_name} --region ${module.gke.cluster_location} --project ${var.project_id}"
}

output "cloud_sql_instance_name" {
  value = module.cloud_sql.instance_name
}

output "cloud_sql_connection_name" {
  value       = module.cloud_sql.connection_name
  description = "Pass to Cloud SQL Auth Proxy."
}

output "cloud_sql_private_ip" {
  value = module.cloud_sql.private_ip
}

output "cloud_sql_app_password" {
  value     = module.cloud_sql.app_password
  sensitive = true
}

output "artifact_registry_path" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/sparx"
}

output "media_bucket" {
  value = module.storage.media_bucket_name
}

output "ingress_ip" {
  value       = google_compute_address.ingress.address
  description = "L4 LB static IP. Annotate the k8s Service with this as loadBalancerIP."
}

output "pubsub_topics" {
  value = module.pubsub.topic_ids
}

output "app_gsa_email" {
  value       = google_service_account.app.email
  description = "Annotate the sparx-app KSA with iam.gke.io/gcp-service-account=<this>."
}
