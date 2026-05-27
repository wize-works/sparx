resource "google_monitoring_notification_channel" "email" {
  display_name = "Sparx ops email"
  type         = "email"
  labels = {
    email_address = var.ops_email
  }
}

# ----- GKE: pod crash looping -----
resource "google_monitoring_alert_policy" "pod_crashloop" {
  display_name = "GKE pod crash looping"
  combiner     = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Container restart count > 5 in 5 min"
    condition_threshold {
      filter          = "metric.type=\"kubernetes.io/container/restart_count\" resource.type=\"k8s_container\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.container_name", "resource.label.namespace_name"]
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

# ----- Cloud SQL: CPU saturation -----
resource "google_monitoring_alert_policy" "cloud_sql_cpu" {
  display_name = "Cloud SQL CPU > 80%"
  combiner     = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "CPU above 80% for 5 min"
    condition_threshold {
      filter          = "metric.type=\"cloudsql.googleapis.com/database/cpu/utilization\" resource.type=\"cloudsql_database\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }
}

# ----- Cloud SQL: storage filling up -----
resource "google_monitoring_alert_policy" "cloud_sql_disk" {
  display_name = "Cloud SQL disk > 85%"
  combiner     = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Disk above 85% for 10 min"
    condition_threshold {
      filter          = "metric.type=\"cloudsql.googleapis.com/database/disk/utilization\" resource.type=\"cloudsql_database\""
      duration        = "600s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.85
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
}

# ----- Cloud SQL: connection pool saturation -----
resource "google_monitoring_alert_policy" "cloud_sql_connections" {
  display_name = "Cloud SQL connection count high"
  combiner     = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Connections > 80 (out of ~100 for db-g1-small)"
    condition_threshold {
      filter          = "metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\" resource.type=\"cloudsql_database\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 80
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
}

# ----- Pub/Sub: dead-letter queue is filling up -----
resource "google_monitoring_alert_policy" "dlq_messages" {
  count        = var.dead_letter_subscription != "" ? 1 : 0
  display_name = "Pub/Sub dead-letter queue has messages"
  combiner     = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Unacked messages in dead-letter-inspect > 0"
    condition_threshold {
      filter          = "metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\" resource.type=\"pubsub_subscription\" resource.label.subscription_id=\"${var.dead_letter_subscription}\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
}

# ----- Uptime checks (only when public domains are live) -----
resource "google_monitoring_uptime_check_config" "api" {
  for_each     = var.public_domains_active ? toset(var.uptime_check_hosts) : []
  display_name = "Uptime: ${each.value}"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      host       = each.value
      project_id = var.project_id
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  for_each     = google_monitoring_uptime_check_config.api
  display_name = "Uptime failing: ${each.key}"
  combiner     = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Check failed for 2 consecutive periods"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" resource.type=\"uptime_url\" metric.label.check_id=\"${each.value.uptime_check_id}\""
      duration        = "120s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
      trigger {
        count = 1
      }
    }
  }
}
