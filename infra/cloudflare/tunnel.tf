# The Cloudflare Tunnel that publishes the Pi. The connector dials out to
# Cloudflare's edge, so nothing is forwarded on the router and the Pi keeps no
# inbound ports open to the internet.

resource "random_bytes" "tunnel_secret" {
  length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "screen_time" {
  account_id = var.cloudflare_account_id
  name       = "screen-time"

  # "cloudflare" = remotely managed: the ingress rules below are the source of
  # truth and the Pi needs no /etc/cloudflared/config.yml.
  config_src = "cloudflare"

  tunnel_secret = random_bytes.tunnel_secret.base64
}

# The connector authenticates with this token; it is written to
# /etc/cloudflared/token on the Pi by hand. See the tunnel_token output.
data "cloudflare_zero_trust_tunnel_cloudflared_token" "screen_time" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.screen_time.id
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "screen_time" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.screen_time.id

  config = {
    ingress = [
      {
        hostname = local.app_hostname
        service  = var.origin_service_url
      },
      # A catch-all with no hostname is required as the final rule; anything that
      # reaches the connector without matching above is refused rather than
      # forwarded somewhere unintended.
      {
        service = "http_status:404"
      },
    ]
  }
}

# Proxied, so Cloudflare terminates TLS and enforces Access in front of the
# tunnel. The record is flattened at the edge — `dig` shows anycast addresses,
# never the cfargotunnel.com target.
resource "cloudflare_dns_record" "screen_time" {
  zone_id = var.cloudflare_zone_id
  name    = local.app_hostname
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.screen_time.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1 # 1 = automatic, and the only value accepted for a proxied record.
  comment = "Cloudflare Tunnel to the screen-time Raspberry Pi (managed by OpenTofu)"
}
