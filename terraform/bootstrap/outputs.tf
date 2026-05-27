output "deployer_sa_email" {
  value       = google_service_account.deployer.email
  description = "Set this as GCP_DEPLOYER_SA_EMAIL in GitHub Actions secrets."
}

output "workload_identity_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "Set this as GCP_WORKLOAD_IDENTITY_PROVIDER in GitHub Actions secrets."
}

output "workload_identity_pool" {
  value = google_iam_workload_identity_pool.github.name
}
