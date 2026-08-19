# AGENTS.md — guidance for AI-assisted work in this repo

Read this before changing anything. It records the architecture, the binding invariants, and the
technology decisions that were deliberately locked during planning — do not relitigate them.

## What this is

A household screen time manager: a SvelteKit PWA (`apps/web`) lets a parent manage a weekly
internet schedule and temporary overrides; a systemd-managed reconcile worker (`apps/worker`) on a
Raspberry Pi enforces the resulting desired state by toggling the `enabled` flag of one manually
created UniFi firewall policy that blocks the Kids network. See `README.md` for setup and
operations.

## Monorepo layout

```
apps/
  web/            SvelteKit PWA (status + override buttons at /, weekly editor at /schedule).
                  Reads/writes SQLite only. Never calls UniFi.
  worker/         Reconcile loop (src/index.ts): every tick, read DB -> computeDesiredState ->
                  GET/PUT the UniFi policy's `enabled` flag only when it differs. Then, per
                  profile and in its own try/catch, the pre-cutoff warning ladder (outbound
                  POSTs to TvOverlay / ntfy.sh), which may never delay or break the reconcile.
                  screen-time-worker.service is the systemd unit.
packages/
  shared/         @screen-time/shared: TypeORM entities + data source (src/db/), the pure
                  desired-state logic (src/desired-state.ts, src/next-transition.ts), the pure
                  warning-threshold logic (src/warnings.ts), the UniFi Integration API client
                  (src/unifi/), and the outbound notification clients (src/notify/: TvOverlay
                  and ntfy). scripts/ holds standalone proof scripts (toggle-proof.ts,
                  db-smoke.ts, writable-policy-check.ts).
infra/
  cloudflare/     OpenTofu config for the Cloudflare Tunnel + Access setup that publishes the
                  web app (tunnel + ingress, proxied DNS record, Google IdP, Access app and
                  policy). Applied by hand; state is local and git-ignored.
docs/
  udm-api-openapi-spec.json   The UniFi API contract (see below; not committed).
```

## Invariants (binding)

- **The worker is the sole UniFi caller.** All UniFi traffic goes through
  `packages/shared/src/unifi/` and is invoked only by `apps/worker`. The web app never talks to
  UniFi. Sole UniFi caller ≠ sole HTTP caller: the worker also makes fire-and-forget outbound
  POSTs to TvOverlay (LAN) and ntfy.sh through `packages/shared/src/notify/`, after the reconcile
  and inside its own try/catch. Those sends may never gate, delay, or fail a policy write.
- **No app↔worker poke channel.** Enforcement latency is one worker tick — default 5 seconds,
  configurable via `apps/worker/.env` — so changes feel nearly instant. The no-poke-channel rule
  stands; the frequent tick is the whole mechanism.
- **SQLite is the only shared state.** The web app and worker communicate exclusively through the
  shared database file (WAL mode); there is no IPC, HTTP, queue, or file signal between them.
- **No web push in the PWA.** Narrowed deliberately in plan 02, not lifted. The PWA is
  installable and still ships no web push: no push subscription, no service-worker push handler,
  no notification code path anywhere in `apps/web`. What changed is only the direction of travel —
  the **worker** MAY send outbound notifications to endpoints configured in `apps/worker/.env`
  (TvOverlay on the LAN, ntfy.sh), both optional and disabled when unset. That is a one-way send
  from the process that already owns the tick, not a push pipeline in the app. Nothing here
  creates an app↔worker channel, and no notification is ever routed through the web app.
- **Authentication is enforced at the Cloudflare edge only.** Cloudflare Access challenges every
  request before it reaches the tunnel; the app itself has no auth, no sessions, and no
  `hooks.server.ts`, and must not grow any. The web app therefore listens on `127.0.0.1` (see
  `apps/web/screen-time-web.service`) — the tunnel connector is its only client, and a port open to
  the LAN would be an unauthenticated way around Access. Do not "helpfully" bind `0.0.0.0` again.

## Do not add (explicitly declined during planning)

Do not add: web push in the PWA, an app→worker notification channel, UniFi calls from the web app,
in-UniFi scheduling, policy creation/discovery logic, or a connection-OK check (explicitly
declined).

The block policy is created manually in the UniFi console; the app only stores its ID
(`Profile.unifiRuleId`) and toggles its `enabled` flag via read-modify-write.

## API reference

`docs/udm-api-openapi-spec.json` (UniFi Network API **v10.5.67**) is the authoritative reference
for the UniFi Integration API. The spec is **not committed** (it is Ubiquiti's file, kept out of
the public repo); export it from your own UniFi console's API documentation page and drop it at
that path. Key facts already baked into the client:

- Auth: `X-API-KEY` header. Server base path: `/proxy/network/integration`, paths site-scoped
  (`/v1/sites/{siteId}/…`).
- Toggling a firewall policy requires **GET → flip `enabled` → PUT the full object**; `PATCH`
  supports only `loggingEnabled`. The PUT body must strip the read-only fields (`id`, `index`,
  `metadata`) — see `toWritableFirewallPolicy`.
- The UDM Pro must be on the Zone-Based Firewall; migrated legacy rules are not API-addressable.

## Locked technology decisions (do not relitigate)

- TypeScript everywhere.
- SvelteKit for the web app; installable PWA via the Vite PWA plugin (`@vite-pwa/sveltekit`).
- Tailwind CSS v4 via `@tailwindcss/vite`, with `@tailwindcss/forms` and `@tailwindcss/typography`.
- shadcn-svelte for UI components.
- Prettier project-wide with `prettier-plugin-tailwindcss` (class sorting); config at `.prettierrc`.
- TypeORM with the `better-sqlite3` driver; entities live in the shared package
  (`packages/shared/src/db/entities/`); schema via `synchronize: true` (greenfield choice).
- Single pnpm workspace (`pnpm-workspace.yaml`: `packages/*`, `apps/*`).
- The worker is a long-running Node process ticking on an interval (not cron) under systemd
  (`apps/worker/screen-time-worker.service`); it reconciles idempotently rather than detecting
  schedule edges.
- Tick default 5000 ms, env-configurable (`TICK_INTERVAL_MS`).
- Public exposure and authentication: **Cloudflare Tunnel + Cloudflare Access**, provisioned with
  **OpenTofu** in `infra/cloudflare/` (provider `cloudflare/cloudflare` v5 — its schema differs
  substantially from v4). No reverse proxy on the Pi, no router port forward, no origin-side JWT
  verification. Identity providers: Google (an OAuth client owned in Google Cloud) plus Cloudflare's
  built-in one-time PIN as a break-glass path; the Access policy allows a fixed list of email
  addresses, so the choice of provider grants no extra reach.
- Secrets are never committed. The Cloudflare API token lives in `CLOUDFLARE_API_TOKEN`, real values
  in a git-ignored `terraform.tfvars` (spec'd by `terraform.tfvars.example`), and the tunnel token in
  `/etc/cloudflared/token` on the Pi. OpenTofu state is local, plaintext, and git-ignored — treat it
  as a password file.

## Key semantics

- **Desired-state logic lives ONLY in `packages/shared/src/desired-state.ts`**
  (`computeDesiredState`). It is the single authority for schedule/override precedence; the worker
  and the web UI must call it, never re-implement any rule. Unit tests sit beside it.
- **Warning-threshold logic lives ONLY in `packages/shared/src/warnings.ts`**
  (`computeDueWarnings`, `WARNING_THRESHOLDS_MINUTES`, `WARNING_GRACE_MS`). It is pure and takes
  the cutoff as an input: the worker supplies it from `computeNextTransition`, and the module must
  never re-derive a cutoff from windows or overrides — that would create a second authority. A
  stale threshold (came due more than `WARNING_GRACE_MS` ago) and any non-smallest due threshold
  are recorded as handled but not sent, so a restart cannot replay a burst. A `warning_log` row
  means "handled", not "delivered", and is written _before_ the send: at-most-once, deliberately.
- Schedule windows are recurring weekly ALLOWED windows, `dayOfWeek` 0 = Sunday … 6 = Saturday,
  covering **`[startMinute, endMinute)`** — start inclusive, end exclusive — in the household's
  IANA `TIMEZONE`. Inside any window ⇒ ON; outside all ⇒ OFF. Midnight-spanning windows are stored
  as two rows.
- Overrides (`extend`, `allow_now`, `block_now`) are active while `effectiveUntil` is in the
  future; among active overrides the most recently created wins.
- **Policy mapping: desired ON ⇒ policy `enabled: false`; desired OFF ⇒ policy `enabled: true`.**
  The UniFi policy blocks traffic when enabled, so "enabled" means the internet is OFF. Keep this
  inversion straight everywhere.

## Commands

```sh
pnpm install
pnpm run build     # all packages
pnpm run check     # shared build + typecheck everything
pnpm run format    # prettier --write .
pnpm dev           # web dev server
pnpm --filter @screen-time/shared test   # vitest unit tests
```
