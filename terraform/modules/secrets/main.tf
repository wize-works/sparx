resource "google_secret_manager_secret" "secrets" {
  for_each  = toset(var.secret_ids)
  secret_id = each.value

  replication {
    auto {}
  }
}
