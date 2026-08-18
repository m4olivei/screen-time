# Household Screen Time Manager

A self-hosted screen time manager for a household behind a UniFi UDM Pro. A parent uses a
phone-installable web app to set a weekly internet schedule for the kids and to apply one-tap
temporary overrides ("+15 min", "Allow now", "Block now"). A small worker process on a Raspberry Pi
continuously reconciles that schedule against a single, manually created UniFi firewall policy that
blocks the Kids network — the UniFi console is never touched day-to-day.

## Architecture

Three pieces in one pnpm workspace, sharing a single SQLite file as the only shared state:

- **`apps/web`** — SvelteKit PWA (installable to a phone home screen). Status page (`/`) with
  override buttons and a weekly schedule editor (`/schedule`). Reads and writes only the SQLite
  database — it never talks to UniFi.
- **`apps/worker`** — a long-running Node reconcile loop (systemd-managed on the Pi). Every tick
  (default 5 s) it reads the database, computes each profile's desired state (ON/OFF) via the shared
  logic, and GETs/PUTs the UniFi firewall policy's `enabled` flag when it differs. It is the sole
  process that calls UniFi.
- **`packages/shared`** — TypeORM entities + SQLite data source, the pure
  `computeDesiredState` schedule/override logic, and the UniFi Integration API client.

There is no channel between the web app and the worker: the web app writes to SQLite, and the
worker's frequent tick picks the change up within seconds. That is the whole mechanism, by design.

### Rule semantics (important)

- The UniFi firewall policy **blocks** the Kids network when it is **enabled**. So: **policy
  enabled ⇒ kids' internet OFF**, policy disabled ⇒ internet ON.
- The app is the **sole owner** of the policy's `enabled` flag. If you toggle the policy by hand in
  the UniFi console, the worker will revert it within seconds (one tick). Change access through the
  app — schedule or overrides — not through UniFi.

## Prerequisite: UDM Pro on the Zone-Based Firewall

The UDM Pro must be running the **Zone-Based Firewall (ZBF)**. If the controller is still on the
legacy firewall, migrate to ZBF first (UniFi console → Settings → Security → prompt to migrate) —
the Integration API's firewall-policy endpoints do not exist otherwise. Note also that firewall
rules migrated from the legacy setup are **not addressable via the API**; the block policy below
must be **created fresh in ZBF**, not carried over from a migrated legacy rule.

## Manual UniFi setup checklist (one time)

1. **Create the block policy** in the UniFi console (Settings → Policy Engine / Firewall):
   - Source: the **Kids network** (the network/SSID all kid devices join)
   - Destination: **external** (the internet)
   - Action: **Block**
   - **No schedule** — leave the policy schedule-free ("Always"). The app owns all scheduling; a
     UniFi-side schedule would fight the worker.
   - Retire/delete any old scheduled rule that used to control kids' access.
2. **Generate an API key**: Settings → Control Plane → Integrations.
3. **Collect the site ID and policy ID** from the Integration API with the key:

   ```sh
   # Site ID:
   curl -sk -H "X-API-KEY: <your-key>" https://192.168.1.1/proxy/network/integration/v1/sites
   # Policy ID (find the block policy you just created by name):
   curl -sk -H "X-API-KEY: <your-key>" \
     https://192.168.1.1/proxy/network/integration/v1/sites/<site-id>/firewall/policies
   ```

4. **(Optional) Export the OpenAPI spec** for development reference: the UniFi console's API
   documentation page offers the Integration API's OpenAPI spec for download. Save it as
   `docs/udm-api-openapi-spec.json` — it is not committed to the repo (it is Ubiquiti's file),
   but `AGENTS.md` points AI tooling at that path as the API contract reference.

## Setup

Requirements: Node.js (with `corepack`/pnpm; the repo pins `pnpm@11.20.0`) and network access from
the machine to the UDM Pro on port 443.

```sh
pnpm install
```

### Environment files

Each package reads its own git-ignored `.env`, spec'd by a committed `.env.example`:

```sh
cp apps/worker/.env.example apps/worker/.env
cp apps/web/.env.example apps/web/.env
```

`apps/worker/.env`:

| Variable            | Meaning                                                                           |
| ------------------- | --------------------------------------------------------------------------------- |
| `UNIFI_GATEWAY_URL` | Base UniFi gateway URL, no trailing slash, e.g. `https://192.168.1.1`             |
| `UNIFI_API_KEY`     | API key generated in the UniFi console                                            |
| `UNIFI_SITE_ID`     | Site ID from the Integration API (`GET /v1/sites`)                                |
| `DB_PATH`           | Absolute path to the shared SQLite file (must match the web app's `DB_PATH`)      |
| `TIMEZONE`          | Household IANA timezone used to evaluate schedule windows, e.g. `America/Toronto` |
| `TICK_INTERVAL_MS`  | Milliseconds between reconcile ticks (default `5000` when unset)                  |

Note there is **no policy-ID variable** in the worker's env: the firewall policy ID lives in the
database on the profile row (`Profile.unifiRuleId`).

`apps/web/.env`:

| Variable   | Meaning                                                                    |
| ---------- | -------------------------------------------------------------------------- |
| `DB_PATH`  | Absolute path to the shared SQLite file (same file the worker uses)        |
| `TIMEZONE` | Household IANA timezone used to evaluate schedule windows and format times |

`packages/shared/.env.example` exists only for the standalone **toggle-proof script** (below); the
running apps never read it. It adds `UNIFI_POLICY_ID`, which the script needs because it runs
without the database.

### Seed the profile row

The database schema is created automatically on first startup (TypeORM `synchronize`), but the one
`profile` row — the profile's name plus the block policy's ID — must be inserted once by hand.
Start the web app or worker once so the tables exist, then:

```sh
sqlite3 "/absolute/path/to/screen-time.sqlite" \
  "INSERT INTO profile (name, unifiRuleId) VALUES ('Kids', '<your-policy-id>');"
```

`unifiRuleId` is the firewall policy ID collected in the UniFi checklist. Schedule windows and
overrides are managed from the app; only this row is manual.

### Verify the UniFi round-trip (optional but recommended)

Prove the API key, site ID and policy ID work before running the worker. Copy
`packages/shared/.env.example` to `packages/shared/.env`, fill it in, then:

```sh
pnpm --filter @screen-time/shared exec tsx scripts/toggle-proof.ts
```

All four variables (`UNIFI_GATEWAY_URL`, `UNIFI_API_KEY`, `UNIFI_SITE_ID`, `UNIFI_POLICY_ID`) are
required. The script GETs the policy, flips `enabled`, confirms the flip, and restores the original
value (always — the restore runs even if a step fails). Exits 0 on success; never prints the key.

## Build and run

```sh
pnpm run build         # build all packages (shared → web → worker)
pnpm run check         # typecheck everything
pnpm run format        # prettier --write .
pnpm dev               # web app dev server (root script; filters to apps/web)
pnpm --filter worker dev     # worker with watch/restart (tsx)
pnpm --filter worker start   # worker once, from TypeScript source
pnpm --filter web preview    # preview the production build (dev tool)
node apps/web/build          # run the built web app standalone (adapter-node; PORT env, default 3000)
```

Shared-package unit tests: `pnpm --filter @screen-time/shared test`.

## Deploying on the Raspberry Pi (systemd)

The recommended layout is a dedicated system user that owns everything the app touches — the
checkout, the env files, and the SQLite database — with the repo at `/opt/screen-time` (the
[FHS](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch03s13.html) location for self-contained
add-on software). Two unit files, `apps/worker/screen-time-worker.service` and
`apps/web/screen-time-web.service`, expect exactly this layout; if you use a different path or
user, edit the `User=` line and the absolute paths in both unit files before installing them.

### 1. Create the service user and install location

```sh
sudo useradd --system --user-group --home-dir /opt/screen-time --shell /usr/sbin/nologin screen-time
sudo mkdir -p /opt/screen-time
sudo chown screen-time:screen-time /opt/screen-time
```

The user has no login shell; run commands as it with `sudo -u screen-time -H <command>`.

### 2. Check out, build, and configure as the service user

```sh
sudo -u screen-time -H git clone <repo-url> /opt/screen-time
cd /opt/screen-time
sudo -u screen-time -H mkdir -p data      # holds the SQLite file (default DB_PATH)
sudo -u screen-time -H cp apps/worker/.env.example apps/worker/.env
sudo -u screen-time -H cp apps/web/.env.example apps/web/.env
# fill in both .env files (sudoedit -u screen-time, or edit as root)
sudo -u screen-time -H pnpm install
sudo -u screen-time -H pnpm run build     # produces apps/worker/dist/index.js
```

The `.env` files must exist **before** the build: the web app validates its required env vars at
module load, and SvelteKit's build analyses the server bundle by importing it, so `vite build`
fails with `Missing required environment variable DB_PATH` if `apps/web/.env` isn't filled in yet.
(Values are not baked into the build — they are still read at runtime.)

Lighter alternative to building on the Pi: run `pnpm run build` on a dev machine, copy the repo to
`/opt/screen-time` **excluding `node_modules`** (build outputs are platform-independent JS), chown
it to `screen-time`, then run `sudo -u screen-time -H pnpm install --prod` — it downloads a
prebuilt ARM binary for `better-sqlite3` and skips all build tooling. The web app then runs with
`node apps/web/build` (adapter-node, port 3000), also as the `screen-time` user so it can write the
shared database.

### 3. Install and enable the worker unit

```sh
sudo cp /opt/screen-time/apps/worker/screen-time-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now screen-time-worker
```

Logs:

```sh
journalctl -u screen-time-worker -f
```

The unit restarts the worker automatically (`Restart=always`).

### 4. Install and enable the web app unit

The web app runs as the same `screen-time` user (it writes the shared database) via
`apps/web/screen-time-web.service`, which serves the adapter-node build on **127.0.0.1:3000**. It
listens on loopback only because the Cloudflare Tunnel connector on the same host is its sole
client — see the next section, and read it before installing this unit, because **the app is not
reachable from the LAN**.

**Before installing, edit the `ORIGIN=` line** in the unit file to the exact public URL the app is
browsed at (`https://screen-time.example.com`, no trailing slash, no path) — SvelteKit rejects form
POSTs (the override buttons) with a 403 when the request's origin doesn't match. That value depends
on the Cloudflare setup below, so if you are deploying for the first time it is fine to install the
unit now and come back to fix `ORIGIN` at the end.

```sh
sudo cp /opt/screen-time/apps/web/screen-time-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now screen-time-web
```

Logs: `journalctl -u screen-time-web -f`. Verify with `curl -s http://127.0.0.1:3000/` on the Pi.

## Publishing the app with Cloudflare Tunnel

The app has no login screen of its own, by design. Authentication is enforced **at Cloudflare's
edge**: a Cloudflare Tunnel connector on the Pi dials out to Cloudflare and Cloudflare Access
challenges every request before anything is forwarded down that tunnel. Nothing is forwarded on the
router, and the Pi keeps no inbound port open to the internet.

The consequence is worth stating plainly: **the app's own port is an unauthenticated way around
Access**, which is why the web unit binds `127.0.0.1` and why the tunnel is the only path in — from
outside the house _and_ from the couch. If the internet or Cloudflare is down, so is the app.

Everything on the Cloudflare side is provisioned with [OpenTofu](https://opentofu.org) from
`infra/cloudflare/`; nothing there is secret except the values you supply, and none of those are
committed.

### 1. One-time manual prerequisites

These cannot be codified and must exist before the first `tofu apply`:

1. **The domain on Cloudflare** — added as a zone, with Cloudflare's nameservers active.
2. **A Zero Trust organization** — Cloudflare dashboard → Zero Trust → choose a team name (it
   becomes `https://<team>.cloudflareaccess.com`) and the Free plan. Note the team name.
3. **A Google Cloud OAuth 2.0 client**, which is what makes "Sign in with Google" work — Google
   Cloud console → APIs & Services → Credentials → Create credentials → OAuth client ID → **Web
   application**:
   - Authorized JavaScript origin: `https://<team>.cloudflareaccess.com`
   - Authorized redirect URI: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
   - Consent screen: **External**, with only the `openid`, `email` and `profile` scopes (those need
     no Google verification review). Add both household accounts as test users, or publish the app.
   - Keep the **client ID** and **client secret**.
4. **A Cloudflare API token** — My Profile → API Tokens → Create Custom Token, with:

   | Scope   | Permission                                            | Level |
   | ------- | ----------------------------------------------------- | ----- |
   | Account | Cloudflare Tunnel                                     | Edit  |
   | Account | Access: Apps and Policies                             | Edit  |
   | Account | Access: Organizations, Identity Providers, and Groups | Edit  |
   | Zone    | DNS (scoped to the one zone)                          | Edit  |

5. **The account ID and zone ID**, from the dashboard overview page.

Keep the hostname a **single label** under the zone (`screen-time.example.com`, not
`screen-time.home.example.com`): Cloudflare's Universal SSL covers `example.com` and `*.example.com`
only, and a deeper name fails TLS in a way that is hard to diagnose.

### 2. Provision the Cloudflare side

From a workstation (not the Pi):

```sh
cd infra/cloudflare
cp terraform.tfvars.example terraform.tfvars   # fill in; it is git-ignored
export CLOUDFLARE_API_TOKEN=...                # never written to a file
tofu init
tofu plan
tofu apply
```

This creates the tunnel and its ingress rules, a proxied CNAME for the hostname, the Google identity
provider, an Access application for the hostname, and an Access policy that allows only the
addresses in `allowed_emails`. Cloudflare's built-in one-time-PIN provider is deliberately _not_
declared (it exists automatically on every account) but stays selectable on the login page as a
break-glass path — the policy matches on email address, so it grants no extra reach.

The local state file holds the tunnel token and the Google client secret. It is git-ignored, but it
is plaintext: treat `infra/cloudflare/terraform.tfstate` like a password file. (`.terraform.lock.hcl`
holds no secrets and _is_ committed.)

### 3. Install the tunnel connector on the Pi

Install `cloudflared` from Cloudflare's apt repository — the `.deb` from GitHub installs the same
binary but leaves no upgrade path:

```sh
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
cloudflared --version
```

Use the `any` codename, not a Debian release name — it is the maintained catch-all and survives a Pi
OS upgrade. (Cloudflare rolled the repo signing key in October 2025; if this Pi ever had an older
cloudflared apt entry, remove the stale list and key first or `apt update` fails with `NO_PUBKEY`.)

Then create the service user and the token file, and install the unit. Read the token on the
workstation with `tofu -chdir=infra/cloudflare output -raw tunnel_token` and paste it in — it is the
only secret the Pi needs for this, and it is never committed:

```sh
sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin cloudflared
sudo install -d -o root -g cloudflared -m 0750 /etc/cloudflared
sudo install -o root -g cloudflared -m 0640 /dev/null /etc/cloudflared/token
sudoedit /etc/cloudflared/token          # paste the token, nothing else
sudo cp /opt/screen-time/apps/web/screen-time-tunnel.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now screen-time-tunnel
```

The unit runs `cloudflared` as its own unprivileged user with no capabilities, so a few benign lines
appear in the log at startup (`ICMP proxy feature is disabled`, a `ping_group_range` warning, and
`Cannot determine default origin certificate path`). None of them need fixing — the details are in
the unit file's header comment.

Finally, set `ORIGIN=https://screen-time.example.com` in `/etc/systemd/system/screen-time-web.service`
if you have not already, then `sudo systemctl daemon-reload && sudo systemctl restart screen-time-web`.

### 4. Verify

Work through these in order; each is independent, so a failure localises cleanly.

**The tunnel is up** (no DNS or Access involved):

```sh
systemctl status screen-time-tunnel      # Type=notify, so "active (running)" means connected
curl -s http://127.0.0.1:20241/ready     # {"status":200,"readyConnections":4,...}
journalctl -u screen-time-tunnel -n 60 --no-pager   # 4 × "Registered tunnel connection"
```

`cloudflared tunnel info` does **not** work here: it authenticates with an origin certificate that a
token-run, remotely-managed tunnel never has. Use `/ready` above, or Zero Trust → Networks → Tunnels
(status **HEALTHY**, 4 connectors).

**DNS and TLS**:

```sh
dig +short screen-time.example.com   # Cloudflare anycast IPs — never the Pi's LAN address
curl -sSv https://screen-time.example.com/ 2>&1 | grep -E 'subject:|issuer:'
```

A proxied record is flattened at the edge, so `dig` never shows the `cfargotunnel.com` target.

**Access challenges everything**:

```sh
for p in / /schedule /manifest.webmanifest /icons/icon-192.png; do
  printf '%s -> ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://screen-time.example.com$p"
done
```

All four must be **302**, redirecting to `https://<team>.cloudflareaccess.com/cdn-cgi/access/login/`.
A 200 anywhere means Access is not attached to that path.

**Login works, and the allow-list actually restricts** — this last part is the only real proof:

1. In a private window, open the app: the login page offers **two** methods (Google, and "Send me a
   code").
2. Sign in with an allowed account; you should land on the status page.
3. `https://screen-time.example.com/cdn-cgi/access/get-identity` returns your email and
   `idp.type: "google"`.
4. **Sign in with a third Google account** — expect Cloudflare's "You do not have permission to
   access this application" page.
5. `https://screen-time.example.com/cdn-cgi/access/logout` clears the session for retesting.

**`ORIGIN` is right** — this is what the override buttons depend on. On the Pi, without side
effects (these bypass Access and exercise only SvelteKit's cross-origin check):

```sh
# Wrong origin must be rejected outright
curl -si -X POST -H 'Origin: https://wrong.example' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'profileId=0' 'http://127.0.0.1:3000/?/extend15' | head -1
# => HTTP/1.1 403   Cross-site POST form submissions are forbidden

# Correct origin passes the check; the action then runs and fails validation
curl -si -X POST -H 'Origin: https://screen-time.example.com' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'profileId=0' 'http://127.0.0.1:3000/?/extend15' | head -1
# => HTTP/1.1 400   <- 400 rather than 403 is the pass condition
```

Then the real test in a browser: open the app and tap **+15 min**. Note this creates a genuine
override the worker will act on within a tick, so do it outside the kids' active window or follow it
immediately with **Pause** / **Allow**.

### 5. Keeping cloudflared updated

The package ships no systemd unit and does not restart anything on upgrade, so updating is two
steps. Worth doing every month or two:

```sh
sudo apt-get update && sudo apt-get install --only-upgrade -y cloudflared \
  && sudo systemctl restart screen-time-tunnel
```

### Troubleshooting

| Symptom                                                    | Cause                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Cloudflare **error 1033** after logging in                 | The connector is down — `systemctl status screen-time-tunnel`                                     |
| **502** after logging in                                   | Tunnel is up, the app is not — `systemctl status screen-time-web`                                 |
| Override buttons give **403**                              | `ORIGIN` doesn't match the browsed URL exactly (watch for a trailing slash)                       |
| Repeated `Failed to create new quic connection` in the log | Router blocks outbound **UDP/7844** — add `--protocol http2` to `ExecStart`, never a port forward |
| Everything 200s without a login                            | The Access application's `domain` doesn't match the hostname                                      |

### Rolling back

Order matters — Cloudflare refuses to delete a tunnel that still has active connections.

```sh
# On the Pi: stop the connector, let connections drain
sudo systemctl disable --now screen-time-tunnel && sleep 15

# On the Pi: put the app back on the LAN
sudoedit /etc/systemd/system/screen-time-web.service   # HOST=0.0.0.0, PORT=3000, ORIGIN=http://<pi-ip>:3000
sudo systemctl daemon-reload && sudo systemctl restart screen-time-web

# On the workstation: tear down the Cloudflare side
tofu -chdir=infra/cloudflare destroy
```

Stopping the connector and reverting `ORIGIN` is enough to restore LAN operation in under a minute,
without touching Cloudflare state — that is the right first move if something breaks at bedtime.

`tofu destroy` does **not** remove the Google Cloud OAuth client (delete it in the Google console —
the client secret in the state file stays valid until you do), the Zero Trust organization, Access
audit logs, the local state files, or the installed PWAs and their session cookies on each phone.

## Install the app on a phone

The web app is a PWA and installs to the home screen (no app store). Install it from the **public
HTTPS URL** — `https://screen-time.example.com`:

- **iOS**: open the URL in **Safari** → tap **Share** → **Add to Home Screen**.
- **Android**: open the URL in **Chrome** → tap the **⋮ menu** → **Add to Home screen** (or
  **Install app** when prompted).

If a phone has an older install pointing at a LAN address, **delete that icon first**. The two URLs
are different origins with separate service workers, caches and cookie jars, so the old install will
never pick up the new one — and after this change the LAN address serves nothing.

On iOS, be aware that when the Cloudflare Access session eventually expires, the login redirect
leaves the installed app's scope for `accounts.google.com`, and home-screen web apps do not share
cookies with Safari. That is why the Access session is provisioned at 30 days; it is also the one
thing worth testing on the actual iPhone before calling the rollout done.

It launches fullscreen like a native app. There are no push notifications — deliberately.
