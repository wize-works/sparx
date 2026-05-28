resource "google_container_cluster" "primary" {
  name     = "${var.name_prefix}-autopilot"
  location = var.region

  enable_autopilot = true

  network    = var.network_id
  subnetwork = var.subnet_id

  ip_allocation_policy {
    cluster_secondary_range_name  = var.pods_range_name
    services_secondary_range_name = var.services_range_name
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = var.master_cidr
  }

  # Public control plane, but only callable from listed CIDRs once populated.
  # Phase 1: empty list = wide-open (still auth-gated). Lock down when ops machines are known.
  master_authorized_networks_config {
    dynamic "cidr_blocks" {
      for_each = var.master_authorized_networks
      content {
        cidr_block   = cidr_blocks.value.cidr
        display_name = cidr_blocks.value.name
      }
    }
  }

  release_channel {
    channel = "REGULAR"
  }

  deletion_protection = var.deletion_protection
}

# Fleet membership — prerequisite for Connect Gateway, which the deploy
# workflow uses to reach the private control plane from GitHub-hosted
# runners. The membership_id matches the cluster name so the workflow can
# resolve it with `gcloud container fleet memberships get-credentials
# "$CLUSTER" --location "$REGION"`.
resource "google_gke_hub_membership" "primary" {
  membership_id = google_container_cluster.primary.name
  # Fleet memberships are global by default; the deploy workflow looks them
  # up with `gcloud container fleet memberships get-credentials "$CLUSTER"
  # --location global`. Regional memberships exist but require explicit
  # opt-in we don't need here.
  location = "global"

  endpoint {
    gke_cluster {
      resource_link = "//container.googleapis.com/${google_container_cluster.primary.id}"
    }
  }

  authority {
    issuer = "https://container.googleapis.com/v1/${google_container_cluster.primary.id}"
  }
}
