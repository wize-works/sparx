# Azure environment — the cost-constrained deployment that replaces GKE.
#
# Budget context: $1000 of credit, targeted to last ~11 months at ~$90/mo. Every
# sizing decision in this environment is made against that number, and the
# reasoning is recorded next to each resource rather than in a separate doc, so
# nobody has to guess later why something is deliberately small.
#
# State lives in Azure Storage, created by terraform/bootstrap-azure. That
# backend is what allows GitHub Actions to run Terraform at all — a CI runner is
# ephemeral, so local state cannot be shared between runs.
#
# The storage account sits in its own resource group (`-tfstate`), deliberately
# separate from the workload, so a `terraform destroy` here can never take the
# state that describes it. Versioning and 30-day soft delete are on: a corrupted
# apply stays recoverable.
#
# Authentication is the caller's — `az login` locally, OIDC federation in
# Actions. No storage key is stored anywhere; `use_azuread_auth` makes the
# backend use Entra identity rather than a shared account key, which is why the
# bootstrap grants `Storage Blob Data Contributor` separately from Contributor.
terraform {
  required_version = ">= 1.9.0"

  backend "azurerm" {
    resource_group_name  = "rg-sparx-prod-cus-tfstate"
    storage_account_name = "stsparxprodcustfstate"
    container_name       = "tfstate"
    key                  = "envs/azure.tfstate"
    use_azuread_auth     = true
  }

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.14"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    // Exists for ONE resource: the Claude deployment in rocketease.tf.
    // `azurerm_cognitive_deployment` cannot express `modelProviderData`
    // (hashicorp/terraform-provider-azurerm#31140), and an Anthropic deployment
    // is rejected without it. Microsoft's own starter kit reaches for azapi for
    // exactly this reason - see Azure-Samples/claude, infra-terraform.
    azapi = {
      source  = "azure/azapi"
      version = "~> 2.0"
    }
    // DNS. Cloudflare is neither an Azure nor a GCP service, which is exactly
    // why the records live in a shared module (../../modules/dns) and this env
    // supplies only the address they point at.
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.40"
    }
    // Both exist solely for origin-ca.tf: `tls` generates the key + CSR that
    // Cloudflare signs, and `kubernetes` writes the result straight into the
    // caddy-admin-origin Secret. Writing it here rather than parking it in a
    // secret store is deliberate — the GCP copy relies on a separate bootstrap
    // sync step, and that step having no Azure equivalent is what let Caddy roll
    // against a certificate nothing had written.
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.2"
    }
    // NO `azuread` PROVIDER HERE, and that is a constraint rather than an
    // omission. This environment is applied by the RELEASE, whose identity holds
    // subscription Contributor and no Microsoft Graph rights at all — a
    // directory app registration is tenant-wide, so creating one from this
    // configuration fails with `Authorization_RequestDenied` no matter how the
    // provider is configured. Identity belongs in terraform/bootstrap-azure,
    // which a human applies. jotDOJO's briefly lived here and 403'd exactly that
    // way; the note at the foot of jotacular.tf records it.
  }
}

provider "azurerm" {
  features {
    resource_group {
      # Refuse to delete a resource group that still contains resources. The
      # whole platform lives in ONE group here, so a stray `terraform destroy`
      # would take the database with it.
      prevent_deletion_if_contains_resources = true
    }
  }
  subscription_id = var.subscription_id
}

// Same subscription, different API surface. Used only by the Claude deployment.
provider "azapi" {
  subscription_id = var.subscription_id
}

// Declared even when var.cloudflare_enabled is false, because Terraform has no
// conditional provider blocks and module.dns references this provider whether or
// not it creates anything.
//
// The provider insists on a credential at PLAN time regardless of whether it
// creates anything. An empty string fails its format check, and null fails with
// "must provide exactly one of api_key, api_token or api_user_service_key" — so
// a plain `terraform plan` here died before it could show the one resource this
// env actually needed.
//
// With DNS switched off the variable therefore carries a syntactically-valid
// PLACEHOLDER, which is never sent anywhere because every resource behind this
// provider is counted to zero. Supply the real token (TF_VAR_cloudflare_api_token)
// in the same change that flips cloudflare_enabled to true.
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

// Credentials come from the cluster resource itself, so there is no kubeconfig
// on disk to drift or to hand a CI runner. AKS keeps local accounts enabled
// here, which is what makes kube_config available; if that is ever disabled this
// block must move to exec-based Entra auth.
//
// Only origin-ca.tf uses this. Terraform does not manage workloads — those are
// kustomize overlays applied by deploy-azure.yml — and it must not start to: the
// one Secret here exists because it is DERIVED from a Terraform-managed
// certificate and has no other way to reach the cluster.
provider "kubernetes" {
  host                   = azurerm_kubernetes_cluster.main.kube_config[0].host
  client_certificate     = base64decode(azurerm_kubernetes_cluster.main.kube_config[0].client_certificate)
  client_key             = base64decode(azurerm_kubernetes_cluster.main.kube_config[0].client_key)
  cluster_ca_certificate = base64decode(azurerm_kubernetes_cluster.main.kube_config[0].cluster_ca_certificate)
}
