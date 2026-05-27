resource "random_id" "instance_suffix" {
  byte_length = 3
}

resource "google_sql_database_instance" "primary" {
  name             = "${var.name_prefix}-pg-${random_id.instance_suffix.hex}"
  database_version = "POSTGRES_16"
  region           = var.region

  settings {
    tier              = var.tier
    edition           = var.edition
    availability_type = var.availability_type
    disk_size         = var.disk_size_gb
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.network_id
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    insights_config {
      query_insights_enabled  = true
      record_application_tags = true
      record_client_address   = false
    }

    maintenance_window {
      day          = 2 # Tuesday
      hour         = 2 # 02:00 UTC — matches the maintenance window in docs/20
      update_track = "stable"
    }

    deletion_protection_enabled = var.deletion_protection
  }

  deletion_protection = var.deletion_protection
}

resource "google_sql_database" "sparx" {
  name     = "sparx"
  instance = google_sql_database_instance.primary.name
}

resource "random_password" "app_user" {
  length      = 32
  special     = false
  min_lower   = 4
  min_upper   = 4
  min_numeric = 4
}

resource "google_sql_user" "app" {
  name     = "sparx_app"
  instance = google_sql_database_instance.primary.name
  password = random_password.app_user.result
}
