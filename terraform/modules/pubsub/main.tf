resource "google_pubsub_topic" "topics" {
  for_each = toset(var.topics)
  name     = each.value

  message_retention_duration = var.message_retention
}

# Dead-letter topic — failed messages from any subscription land here after
# max_delivery_attempts. Inspect with `gcloud pubsub subscriptions pull dead-letter-inspect`.
resource "google_pubsub_topic" "dead_letter" {
  count                      = var.enable_dead_letter ? 1 : 0
  name                       = var.dead_letter_topic
  message_retention_duration = "604800s" # 7 days — DLQ messages worth investigating
}

resource "google_pubsub_subscription" "dead_letter_inspect" {
  count = var.enable_dead_letter ? 1 : 0
  name  = "${var.dead_letter_topic}-inspect"
  topic = google_pubsub_topic.dead_letter[0].name

  ack_deadline_seconds       = 60
  message_retention_duration = "604800s"
}

# Pub/Sub service account needs publisher on the DLT and subscriber on each
# subscription that uses it. Project-wide grant is the conventional pattern.
data "google_project" "current" {}

resource "google_pubsub_topic_iam_member" "dlq_publisher" {
  count  = var.enable_dead_letter ? 1 : 0
  topic  = google_pubsub_topic.dead_letter[0].name
  role   = "roles/pubsub.publisher"
  member = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_subscription" "subscriptions" {
  for_each = var.subscriptions
  name     = each.key
  topic    = google_pubsub_topic.topics[each.value.topic].name

  ack_deadline_seconds       = each.value.ack_deadline_seconds
  message_retention_duration = each.value.message_retention_duration

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dynamic "dead_letter_policy" {
    for_each = var.enable_dead_letter && each.value.use_dead_letter ? [1] : []
    content {
      dead_letter_topic     = google_pubsub_topic.dead_letter[0].id
      max_delivery_attempts = each.value.max_delivery_attempts
    }
  }

  expiration_policy {
    ttl = "" # never expire — pull subscriptions stay even if idle
  }
}

# Grant the Pub/Sub managed SA subscriber on every subscription that uses DLQ.
resource "google_pubsub_subscription_iam_member" "dlq_subscriber" {
  for_each = {
    for k, v in var.subscriptions :
    k => v if var.enable_dead_letter && v.use_dead_letter
  }
  subscription = google_pubsub_subscription.subscriptions[each.key].name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}
