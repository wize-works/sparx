resource "google_storage_bucket" "media" {
  name          = var.media_bucket_name
  location      = var.location
  force_destroy = false

  uniform_bucket_level_access = true
  # "inherited" lets us grant public-read on the `/variants/` prefix below
  # via a conditional IAM binding while keeping originals private. The
  # alternative — full enforcement — would require routing every variant
  # GET through a signing proxy, which defeats the point of a CDN.
  public_access_prevention = "inherited"

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 5
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      age                   = 30
      with_state            = "ARCHIVED"
      matches_storage_class = ["STANDARD"]
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  # CORS must allow PUT from app.sparx.works so the dashboard's
  # presigned-URL uploads land directly on GCS (no api-rest hop). GET/HEAD
  # are wide-open so the CDN + storefronts on arbitrary tenant domains can
  # fetch variants.
  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type", "Content-Length", "Cache-Control"]
    max_age_seconds = 3600
  }

  cors {
    origin          = var.upload_origins
    method          = ["PUT", "OPTIONS"]
    response_header = ["Content-Type", "Content-Length"]
    max_age_seconds = 3600
  }
}

# Public-read on the `/variants/` prefix only. Originals stay private and
# are served via signed GETs from api-rest. The IAM condition uses
# `resource.name.startsWith` against the variant prefix — GCS evaluates
# the condition per object at access time.
resource "google_storage_bucket_iam_member" "media_public_variants" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"

  condition {
    title       = "variants_only"
    description = "Anyone can read objects under .../variants/. Originals stay private."
    expression  = "resource.name.startsWith(\"projects/_/buckets/${google_storage_bucket.media.name}/objects/\") && resource.name.matches(\"/variants/\")"
  }
}
