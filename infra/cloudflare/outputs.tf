output "app_url" {
  description = "Public URL of the app."
  value       = local.app_url
}

output "tunnel_id" {
  description = "UUID of the tunnel; matches the connector shown in Zero Trust > Networks > Tunnels."
  value       = cloudflare_zero_trust_tunnel_cloudflared.screen_time.id
}

output "access_aud" {
  description = "Access application audience tag (only needed if the origin ever verifies the Access JWT)."
  value       = cloudflare_zero_trust_access_application.screen_time.aud
}

output "access_login_url" {
  description = "Where an unauthenticated request is redirected; useful when checking the 302."
  value       = "https://${var.zero_trust_team_name}.cloudflareaccess.com"
}

# Read with `tofu output -raw tunnel_token` and paste into /etc/cloudflared/token
# on the Pi. Marked sensitive so it is never printed by a plain `tofu output` or
# an apply summary.
output "tunnel_token" {
  description = "Connector token for screen-time-tunnel.service on the Pi."
  value       = data.cloudflare_zero_trust_tunnel_cloudflared_token.screen_time.token
  sensitive   = true
}
