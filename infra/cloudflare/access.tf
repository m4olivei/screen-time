# Cloudflare Access: the authentication layer. Every request to the hostname is
# challenged at the edge and only forwarded down the tunnel once it carries a
# valid session for one of the allowed emails. The app itself has no auth code.

# Cloudflare's built-in one-time PIN provider is created automatically for every
# account and cannot be declared here without colliding with it, so only Google
# is managed. Both remain selectable on the login page (see allowed_idps below).
resource "cloudflare_zero_trust_access_identity_provider" "google" {
  account_id = var.cloudflare_account_id
  name       = "Google"
  type       = "google"

  config = {
    client_id     = var.google_client_id
    client_secret = var.google_client_secret
  }
}

# A reusable, account-level policy. The rule is on the email address, not the
# identity provider, so the one-time-PIN fallback grants no extra reach: the same
# addresses are the only ones that pass either way.
resource "cloudflare_zero_trust_access_policy" "household" {
  account_id = var.cloudflare_account_id
  name       = "Screen Time household"
  decision   = "allow"

  # A policy's session_duration overrides the application's, so both are set to
  # the same value.
  session_duration = var.access_session_duration

  include = [
    for email in var.allowed_emails : {
      email = {
        email = email
      }
    }
  ]
}

resource "cloudflare_zero_trust_access_application" "screen_time" {
  account_id = var.cloudflare_account_id
  name       = "Screen Time"
  type       = "self_hosted"
  domain     = local.app_hostname

  session_duration = var.access_session_duration

  policies = [
    {
      id         = cloudflare_zero_trust_access_policy.household.id
      precedence = 1
    },
  ]

  # allowed_idps is deliberately unset: leaving it empty offers every configured
  # provider, which is what keeps the built-in one-time PIN available as a
  # break-glass path if the Google OAuth client ever breaks. auto_redirect_to_
  # identity must stay false for the same reason — with a single allowed
  # provider Cloudflare would skip the chooser and the fallback would be
  # unreachable.
  auto_redirect_to_identity = false

  app_launcher_visible = true

  depends_on = [cloudflare_zero_trust_access_identity_provider.google]
}
