output "topic_ids" {
  value = { for k, v in google_pubsub_topic.topics : k => v.id }
}

output "subscription_ids" {
  value = { for k, v in google_pubsub_subscription.subscriptions : k => v.id }
}

output "dead_letter_topic" {
  value = var.enable_dead_letter ? google_pubsub_topic.dead_letter[0].name : null
}
