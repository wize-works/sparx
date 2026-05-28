output "cluster_name" {
  value = google_container_cluster.primary.name
}

output "cluster_endpoint" {
  value     = google_container_cluster.primary.endpoint
  sensitive = true
}

output "cluster_ca_certificate" {
  value     = google_container_cluster.primary.master_auth[0].cluster_ca_certificate
  sensitive = true
}

output "cluster_location" {
  value = google_container_cluster.primary.location
}

output "fleet_membership_id" {
  value = google_gke_hub_membership.primary.membership_id
}

output "fleet_membership_location" {
  value = google_gke_hub_membership.primary.location
}
