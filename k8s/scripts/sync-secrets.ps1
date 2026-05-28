# Sync Secret Manager → k8s Secret for the sparx-app-secrets bundle.
#
# Phase 1 manual sync. When this becomes painful, replace with External Secrets
# Operator (https://external-secrets.io).
#
# Usage: ./sync-secrets.ps1 -ProjectId my-gcp-project

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,

    [string]$Namespace = "sparx-prod",

    [string]$SecretName = "sparx-app-secrets"
)

$ErrorActionPreference = "Stop"

$secretKeys = @(
    "database-url",
    "auth-database-url",
    "redis-url",
    "better-auth-secret",
    "sparx-internal-jwt-secret",
    "stripe-secret-key",
    "stripe-webhook-secret",
    "godaddy-api-key-ote",
    "godaddy-api-secret-ote",
    "godaddy-api-key-prod",
    "godaddy-api-secret-prod",
    "postal-api-key",
    "cloudflare-api-token"
)

$literals = @()
foreach ($key in $secretKeys) {
    Write-Host "Fetching $key..."
    $value = gcloud secrets versions access latest --secret=$key --project=$ProjectId
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Skipping $key — not set in Secret Manager yet."
        continue
    }
    # Convert kebab-case secret id to SCREAMING_SNAKE_CASE env var name
    $envName = ($key -replace "-", "_").ToUpper()
    $literals += "--from-literal=${envName}=${value}"
}

Write-Host "Recreating $SecretName in namespace $Namespace..."
kubectl delete secret $SecretName -n $Namespace --ignore-not-found
kubectl create secret generic $SecretName -n $Namespace @literals

Write-Host "Restarting app + worker Deployments to pick up new values..."
kubectl rollout restart deployment -n $Namespace -l tier=api
kubectl rollout restart deployment -n $Namespace -l tier=worker

Write-Host "Done."
