output "instance_name" {
  value = google_sql_database_instance.primary.name
}

output "connection_name" {
  value       = google_sql_database_instance.primary.connection_name
  description = "Pass to Cloud SQL Auth Proxy as -instances."
}

output "private_ip" {
  value = google_sql_database_instance.primary.private_ip_address
}

output "database_name" {
  value = google_sql_database.sparx.name
}

output "app_user" {
  value = google_sql_user.app.name
}

output "app_password" {
  value     = random_password.app_user.result
  sensitive = true
}
