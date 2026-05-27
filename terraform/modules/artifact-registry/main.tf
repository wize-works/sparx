resource "google_artifact_registry_repository" "sparx" {
  location      = var.region
  repository_id = var.repository_id
  format        = "DOCKER"
  description   = "Sparx container images"

  cleanup_policies {
    id     = "keep-recent-10"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }

  cleanup_policies {
    id     = "delete-untagged-7d"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }
}
