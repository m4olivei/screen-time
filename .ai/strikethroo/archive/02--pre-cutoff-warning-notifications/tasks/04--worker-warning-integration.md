---
id: 4
group: "worker-integration"
dependencies: [1, 2, 3]
status: "completed"
created: 2026-08-18
skills:
  - nodejs
  - typescript
complexity_score: 5
complexity_notes: "Integration point wiring three shared modules into the existing tick; the enforcement-isolation requirement is the part most easily got wrong."
---
# Wire Warnings into the Worker Tick

## Objective
Add the warning step to the worker's existing reconcile tick: read the two optional transport variables, evaluate due warnings after each profile's UniFi reconcile, record them before sending, and dispatch to every configured transport — all without giving notification delivery any power to delay or break enforcement.

## Skills Required
`nodejs` for the process configuration and the long-running tick loop; `typescript` for the integration against the shared modules.

## Acceptance Criteria
- [ ] `apps/worker/src/index.ts` reads `NTFY_TOPIC_URL` and `TVOVERLAY_URL` as **optional** variables — via plain `process.env` access, not `requireEnv`. An unset or empty variable disables that transport.
- [ ] Startup logs one line naming which transports are active, so a typo is visible immediately in `journalctl`.
- [ ] With both variables unset, the worker starts and its per-tick `profile=... desired=... policyEnabled=... action=...` output is byte-identical in shape to today's.
- [ ] The warning step runs **after** the UniFi reconcile for each profile, inside its own `try`/`catch` that logs and swallows any error.
- [ ] Warnings are evaluated only when the profile's desired state is `ON` and `computeNextTransition` returns a non-null cutoff.
- [ ] Thresholds returned by `computeDueWarnings` are recorded via `recordHandledThresholds` **before** any send is attempted.
- [ ] `pruneWarningLog` is called once per tick alongside the existing `pruneExpiredOverrides`.
- [ ] Failure isolation check: set `TVOVERLAY_URL=http://127.0.0.1:9`, run the worker, and confirm the reconcile log line still appears every tick with the send failure logged separately on its own line.
- [ ] End-to-end check against a throwaway `DB_PATH`: with the worker running, insert an `allow_now` override with `effectiveUntil` about 2 minutes 10 seconds ahead, then confirm exactly two sends occur — `Internet turns off in 2 minutes` then `Internet turns off in 1 minute` — and that `sqlite3 "$DB_PATH" "SELECT thresholdMinutes FROM warning_log ORDER BY thresholdMinutes DESC;"` returns all of `30 15 10 5 2 1`, proving the four stale thresholds were recorded without being sent.
- [ ] `pnpm run check` exits 0.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- The cutoff must come from `computeNextTransition` with the same `now`, windows and overrides already loaded for the reconcile in that iteration — do not re-query or re-derive it.
- Build the active transport list once at startup, not per tick.
- Keep the existing behaviour that a tick error never exits the loop.
- Do not add an `.env` variable for the timeout, the grace period, or the threshold list; those are constants in shared code by design.
- Do not modify `apps/web` and do not add any signalling between the web app and the worker — SQLite remains the only shared state.

## Input Dependencies
- Task 1: `computeDueWarnings`, `describeWarning`, `WARNING_GRACE_MS`.
- Task 2: `getHandledThresholds`, `recordHandledThresholds`, `pruneWarningLog`.
- Task 3: `createTvOverlayNotifier`, `createNtfyNotifier`, the `Notifier` interface.

## Output Artifacts
- Updated `apps/worker/src/index.ts` with configuration, startup logging, and the warning step inside `tick()`.

## Implementation Notes

<details>
<summary>Detailed implementation guidance</summary>

Configuration sits beside the existing `config` object. Use plain optional reads so the worker deploys to the Pi before `.env` is touched:

```
ntfyTopicUrl: process.env.NTFY_TOPIC_URL || undefined,
tvOverlayUrl: process.env.TVOVERLAY_URL || undefined,
```

Build the transports once in `main()` and pass the array into `tick()`. Log something like `notifications: tvoverlay=active ntfy=inactive`.

Inside the per-profile loop in `tick()`, after the existing reconcile block:

1. Skip unless `desired === 'ON'`.
2. `const cutoff = computeNextTransition({ now, timeZone, windows, overrides })` — reuse the values already in scope. Skip if null.
3. `const handled = await getHandledThresholds(dataSource, profile.id, cutoff)`.
4. `const { send, handle } = computeDueWarnings({ now, cutoff, handledThresholds: handled, graceMs: WARNING_GRACE_MS })`.
5. If `handle` is empty, do nothing further.
6. `await recordHandledThresholds(dataSource, profile.id, cutoff, handle)` — **before** any send.
7. If `send` is non-null, build the notice with `describeWarning(send)` and dispatch to every configured transport, logging each result.

Step 6 preceding step 7 is the deliberate at-most-once bias recorded in the plan: if the process dies mid-send the warning is lost rather than repeated, because a duplicate "5 minutes left" is more confusing to a kid than a missing one.

Wrap steps 1-7 in `try`/`catch` and log failures as a distinct line. Combined with the 3-second per-request timeout from task 3, the worst case is a few seconds added to one tick while the firewall policy has already been reconciled.

For the end-to-end acceptance check, seed the throwaway database with a profile row and insert the override directly:

```
sqlite3 "$DB_PATH" "INSERT INTO override (profileId, type, effectiveUntil, createdAt) VALUES (1, 'allow_now', datetime('now','+130 seconds'), datetime('now'));"
```

Both transports may point at unreachable addresses for this check — the assertion is about which thresholds were selected and recorded, which the log lines and the `warning_log` table both show.
</details>
