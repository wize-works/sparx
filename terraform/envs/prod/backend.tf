terraform {
  backend "gcs" {
    bucket = "sparx-terraform-state"
    prefix = "envs/prod"
  }
}
