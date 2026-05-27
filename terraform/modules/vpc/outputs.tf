output "network_id" {
  value = google_compute_network.vpc.id
}

output "network_name" {
  value = google_compute_network.vpc.name
}

output "network_self_link" {
  value = google_compute_network.vpc.self_link
}

output "subnet_id" {
  value = google_compute_subnetwork.primary.id
}

output "subnet_self_link" {
  value = google_compute_subnetwork.primary.self_link
}

output "pods_range_name" {
  value = "${var.name_prefix}-pods"
}

output "services_range_name" {
  value = "${var.name_prefix}-services"
}

output "psa_connection" {
  value       = google_service_networking_connection.psa
  description = "Pass as depends_on to anything that uses private IP (Cloud SQL, Memorystore)."
}
