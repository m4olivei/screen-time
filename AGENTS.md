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
                  GET/PUT the UniFi policy's `enabled` flag only when it differs.
                  screen-time-worker.service is the systemd unit.
packages/
  shared/         @screen-time/shared: TypeORM entities + data source (src/db/), the pure
                  desired-state logic (src/desired-state.ts, src/next-transition.ts), and the
                  UniFi Integration API client (src/unifi/). scripts/ holds standalone proof
                  scripts (toggle-proof.ts, db-smoke.ts, writable-policy-check.ts).
docs/
  udm-api-openapi-spec.json   The UniFi API contract (see below; not committed).
```

## Invariants (binding)

- **The worker is the sole UniFi caller.** All UniFi traffic goes through
  `packages/shared/src/unifi/` and is invoked only by `apps/worker`. The web app never talks to
  UniFi.
- **No app↔worker poke channel.** Enforcement latency is one worker tick — default 5 seconds,
  configurable via `apps/worker/.env` — so changes feel nearly instant. The no-poke-channel rule
  stands; the frequent tick is the whole mechanism.
- **SQLite is the only shared state.** The web app and worker communicate exclusively through the
  shared database file (WAL mode); there is no IPC, HTTP, queue, or file signal between them.
- **No push notifications.** The PWA is installable but deliberately excludes push.

## Do not add (explicitly declined during planning)

Do not add: push notifications, an app→worker notification channel, UniFi calls from the web app,
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

## Key semantics

- **Desired-state logic lives ONLY in `packages/shared/src/desired-state.ts`**
  (`computeDesiredState`). It is the single authority for schedule/override precedence; the worker
  and the web UI must call it, never re-implement any rule. Unit tests sit beside it.
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
