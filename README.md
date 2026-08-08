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
pnpm --filter web preview    # serve the production build of the web app
```

Shared-package unit tests: `pnpm --filter @screen-time/shared test`.

## Deploying the worker on the Raspberry Pi (systemd)

The unit file `apps/worker/screen-time-worker.service` expects this layout:

- Repo checked out at `/home/pi/screen-time`
- Built once: `pnpm install && pnpm run build` (produces
  `/home/pi/screen-time/apps/worker/dist/index.js`)
- Env file at `/home/pi/screen-time/apps/worker/.env` (copied from `.env.example`, filled in)

Install and enable:

```sh
sudo cp /home/pi/screen-time/apps/worker/screen-time-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now screen-time-worker
```

Logs:

```sh
journalctl -u screen-time-worker -f
```

The unit restarts the worker automatically (`Restart=always`).

## Install the app on a phone

The web app is a PWA and installs to the home screen (no app store):

- **iOS**: open the app's URL in **Safari** → tap **Share** → **Add to Home Screen**.
- **Android**: open the URL in **Chrome** → tap the **⋮ menu** → **Add to Home screen** (or
  **Install app** when prompted).

It launches fullscreen like a native app. There are no push notifications — deliberately.
