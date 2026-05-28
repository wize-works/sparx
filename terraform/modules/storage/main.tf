# Private bucket — originals + anything tenant-sensitive. UBLA enforced;
# all access is via Workload-Identity-bound service accounts or signed URLs.
resource "google_storage_bucket" "media" {
  name          = var.media_bucket_name
  location      = var.location
  force_destroy = false

  uniform_bucket_level_access = true
  # No public principals here — full prevention is the right setting.
  public_access_prevention = "enforced"

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

  # CORS for presigned PUTs from the dashboard. No GET/HEAD here — originals
  # are never fetched directly by a browser; api-rest streams them when
  # needed (e.g. variant regeneration triggered from the admin UI).
  cors {
    origin          = var.upload_origins
    method          = ["PUT", "OPTIONS"]
    response_header = ["Content-Type", "Content-Length"]
    max_age_seconds = 3600
  }
}

# Public bucket — derived variants only. Kept *private* at the GCS layer
# because the org enforces iam.allowedPolicyMemberDomains, which forbids
# allUsers bindings (Domain Restricted Sharing). Variants are served to
# storefronts via api-rest's GET /v1/public/media/variants/:key route,
# which reads here using the app SA and lets Cloudflare cache the response
# at the edge with Cache-Control: public, immutable, max-age=1yr.
#
# The split bucket is still worth keeping:
#   - lifecycle: variants are deterministic, no versioning needed; originals
#     keep 5 prior versions
#   - cost: variants are STANDARD-only (hot); originals tier to NEARLINE
#   - future: if the org policy carves out an exception for this bucket,
#     flipping to allUsers:objectViewer is a one-line change
resource "google_storage_bucket" "media_public" {
  name          = "${var.media_bucket_name}-public"
  location      = var.location
  force_destroy = false

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # PUT CORS only — same upload-from-dashboard story as the private bucket.
  # GET/HEAD not needed: browsers never hit GCS directly, they hit api-rest.
  cors {
    origin          = var.upload_origins
    method          = ["PUT", "OPTIONS"]
    response_header = ["Content-Type", "Content-Length"]
    max_age_seconds = 3600
  }
}
