# Provider and version pins. The Cloudflare provider's v5 schema differs
# substantially from v4 (cloudflare_dns_record rather than cloudflare_record,
# list-of-objects rule syntax, standalone reusable Access policies), so the
# major version is pinned rather than left open.

terraform {
  required_version = ">= 1.8"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.8"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# The API token is read from the CLOUDFLARE_API_TOKEN environment variable so it
# never lands in a file. See README for the exact permissions it needs.
provider "cloudflare" {}
