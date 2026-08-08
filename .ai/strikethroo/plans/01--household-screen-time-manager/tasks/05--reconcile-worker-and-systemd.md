---
id: 5
group: "worker"
dependencies: [2, 3, 4]
status: "pending"
created: 2026-08-07
skills:
  - nodejs
  - systemd
complexity_score: 4
---
# Reconcile worker with systemd unit

## Objective
Build the long-running worker in `apps/worker`: every tick (default 5 seconds, env-configurable) read the database, compute desired state via the shared function, and reconcile the UniFi policy's `enabled` flag — writing to the gateway only when actual state differs from desired. Ship the systemd unit and the worker's `.env.example`.

## Skills Required
`nodejs` for the long-lived loop process; `systemd` for the service unit and env-file wiring.

## Acceptance Criteria
- [ ] Worker opens the shared data source on start, then loops on `TICK_INTERVAL_MS` (or equivalent) from `apps/worker/.env`, defaulting to 5000 when unset.
- [ ] Each tick, per profile: load windows + active overrides, call `computeDesiredState`, map ON ⇒ policy disabled / OFF ⇒ policy enabled, GET the policy, and PUT only when `enabled` differs from desired. Logs each state transition; no PUT on no-op ticks.
- [ ] Every tick is wrapped in try/catch — a transient UniFi/DB error is logged and the loop continues on the next tick; the process never exits on a tick error.
- [ ] On startup the worker logs the policy name it controls (from a GET), so a wrong configured ID is immediately visible.
- [ ] `apps/worker/.env.example` is committed documenting every variable (gateway URL, API key, site ID, SQLite path, timezone, tick interval) with placeholder values; `apps/worker/.env` is git-ignored.
- [ ] A systemd unit file ships in the repo (e.g. `apps/worker/screen-time-worker.service`) with `Restart=always`, `EnvironmentFile=` pointing at the worker's `.env`, and `WantedBy=multi-user.target`.
- [ ] Runnable verification: with a seeded local SQLite (profile + a `block_now` override) and live env, run the worker for ~15 seconds and observe log output showing a reconcile PUT to the expected state, then only no-op ticks; kill and restart it and observe idempotent behavior (no second PUT when state already matches).

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- Imports the data source, queries, `computeDesiredState`, and the UniFi client from `packages/shared` — no logic duplicated locally.
- Load `.env` from the package directory (e.g. `dotenv`), matching the plan's per-package env convention.
- Plain `setTimeout`/sleep loop — no cron, no schedulers, no poke channel (explicitly forbidden by the plan).
- Note: the plan's Profile row holds `unifiRuleId`; site ID and gateway settings come from env.

## Input Dependencies
Task 2 (data source + queries), task 3 (`computeDesiredState`), task 4 (UniFi client).

## Output Artifacts
Runnable worker (`apps/worker`), its `.env.example`, and the systemd unit file — the enforcement half of the system. Consumed by task 9 (docs) for setup instructions.

## Implementation Notes
<details>
<summary>Detailed guidance</summary>

- Loop shape: `while (true) { try { await tick() } catch (e) { log(e) } await sleep(interval) }` — asleep between ticks, near-zero CPU.
- Reconcile-don't-chase-edges: every tick computes absolute desired state; never track "a window just started". The write-on-mismatch check is a read of current `enabled` vs desired — still stateless across ticks.
- Prune expired overrides opportunistically during ticks using the shared query helper.
- Log lines should include profile name, desired state, actual state, and action taken (`noop` / `enable` / `disable`) — these are the observability surface named in the plan's self-validation.
- systemd unit: `[Service] ExecStart=` the built worker via node (document the expected install path on the Pi in a comment header); `Restart=always`, `RestartSec=5`.
- Do not add: health endpoints, metrics, push notifications, or any IPC with the web app.

</details>
