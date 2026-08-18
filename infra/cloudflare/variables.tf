# Anything holding a real household value is declared without a default, so the
# committed files stay free of personal data: fill terraform.tfvars (git-ignored)
# from terraform.tfvars.example.

variable "cloudflare_account_id" {
  description = "Cloudflare account ID (dashboard overview page)."
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Zone ID of the domain the app is published under."
  type        = string
}

variable "zone_name" {
  description = "The zone's apex domain, e.g. example.com."
  type        = string
}

variable "subdomain" {
  description = <<-EOT
    Label the app is published at, under zone_name. Keep it a single label:
    Cloudflare's Universal SSL covers <zone> and *.<zone> only, so a deeper name
    like screen-time.home.<zone> fails TLS with no obvious cause.
  EOT
  type        = string
  default     = "screen-time"

  validation {
    condition     = !strcontains(var.subdomain, ".")
    error_message = "subdomain must be a single label (no dots) — Universal SSL covers one level only."
  }
}

variable "zero_trust_team_name" {
  description = <<-EOT
    Zero Trust organization / team name, i.e. the <team> in
    https://<team>.cloudflareaccess.com. Used for outputs and documentation
    only; the organization itself is created once in the dashboard.
  EOT
  type        = string
}

variable "allowed_emails" {
  description = "Email addresses allowed through Access. Everyone else is denied."
  type        = list(string)
  sensitive   = true

  validation {
    condition     = length(var.allowed_emails) > 0
    error_message = "allowed_emails must not be empty — an Access policy with no include rules matches nobody."
  }
}

variable "google_client_id" {
  description = "Client ID of the Google Cloud OAuth 2.0 web client backing the Google IdP."
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Client secret of that Google Cloud OAuth 2.0 web client."
  type        = string
  sensitive   = true
}

variable "origin_service_url" {
  description = <<-EOT
    Where the connector forwards traffic on the Pi. Must match HOST/PORT in
    apps/web/screen-time-web.service. Use 127.0.0.1, not localhost: with the app
    bound to IPv4 loopback, localhost resolving to ::1 first yields a confusing
    502.
  EOT
  type        = string
  default     = "http://127.0.0.1:3000"
}

variable "access_session_duration" {
  description = <<-EOT
    How long an Access session lasts before re-authentication. Cloudflare accepts
    a fixed set of values only. 730h (30 days) is deliberate: the primary clients
    are installed PWAs on phones, and on iOS a re-login leaves the standalone
    window for accounts.google.com and does not share cookies with Safari, which
    is the worst experience in this whole setup. The organization-level global
    session timeout in Zero Trust settings still caps this.
  EOT
  type        = string
  default     = "730h"

  validation {
    condition     = contains(["30m", "6h", "12h", "24h", "168h", "730h"], var.access_session_duration)
    error_message = "access_session_duration must be one of: 30m, 6h, 12h, 24h, 168h, 730h."
  }
}

locals {
  app_hostname = "${var.subdomain}.${var.zone_name}"
  app_url      = "https://${var.subdomain}.${var.zone_name}"
}
