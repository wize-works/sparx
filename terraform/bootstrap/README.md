# Bootstrap

One-time setup. Run once per project. Manages:

- Required GCP API enablement
- `sparx-deployer` service account (used by GitHub Actions for app CD)
- Workload Identity Federation pool + provider scoped to the `wize-works/sparx` repo

The Terraform state bucket itself (`gs://sparx-terraform-state`) is created **manually before this runs** — see the parent [README](../README.md).

## Apply

```powershell
$env:PROJECT_ID = "<sparx-gcp-project-id>"
terraform init
terraform apply -var "project_id=$env:PROJECT_ID"
```

## Outputs to record

After apply, save these to the repo's GitHub Actions secrets:

- `GCP_WORKLOAD_IDENTITY_PROVIDER` — full resource path of the WIF provider
- `GCP_DEPLOYER_SA_EMAIL` — service account email for `google-github-actions/auth`
