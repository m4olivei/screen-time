---
id: 3
group: "shared-package"
dependencies: []
status: "pending"
created: 2026-08-18
skills:
  - typescript
  - http-client
complexity_score: 4
---
# TvOverlay and ntfy Notification Transports

## Objective
Add two small HTTP notification clients to `packages/shared/src/notify/` behind one shared interface — TvOverlay for the Sony BRAVIA and ntfy.sh for laptops and phones — each with a short timeout and a resolve-never-throw contract so a failing transport can never disturb the caller.

## Skills Required
`typescript` for the interface and module structure; `http-client` for the `fetch` calls, abort-based timeouts, and the two request formats.

## Acceptance Criteria
- [ ] `packages/shared/src/notify/index.ts` exports a `Notifier` interface with a single `send(notice): Promise<boolean>` method, where `notice` is `{ title, message, durationSeconds, thresholdMinutes }`.
- [ ] `createTvOverlayNotifier(baseUrl)` POSTs JSON to `{baseUrl}/notify` with `title`, `message`, a stable per-threshold `id` (e.g. `screen-time-warning-15`), `smallIcon` `mdi:timer-sand`, `corner` `top_end`, and `duration` set from `durationSeconds`.
- [ ] `createNtfyNotifier(topicUrl)` POSTs to `topicUrl` with the message as the plain-text request body and the title in a `Title` header. It must NOT send a duration — ntfy has no such concept.
- [ ] Both clients use a 3000 ms timeout via `AbortSignal.timeout(3000)`.
- [ ] Both return `true` on a 2xx response and `false` on any non-2xx, network error, or timeout. Neither ever rejects.
- [ ] Concrete failure check: `pnpm --filter @screen-time/shared exec tsx -e "import {createTvOverlayNotifier} from './src/notify/index.js'; console.log(await createTvOverlayNotifier('http://127.0.0.1:9').send({title:'t',message:'m',durationSeconds:15,thresholdMinutes:15}));"` prints `false` within about 4 seconds and exits 0 with no unhandled rejection.
- [ ] The exports are re-exported from `packages/shared/src/index.ts`.
- [ ] `pnpm run check` exits 0.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- Use the global `fetch`. Unlike `packages/shared/src/unifi/client.ts`, no undici `Agent` is needed here: TvOverlay is plain HTTP on the LAN and ntfy.sh presents a valid public certificate, so there is no self-signed TLS exception to make.
- No retries, no backoff, no queueing. The worker's next tick is not a retry mechanism for warnings — a missed warning is simply missed, by design.
- No configuration surface beyond the target URL passed at construction.
- Log or return enough for the caller to log a useful failure line, but do not print from inside the clients; the worker owns logging.
- TvOverlay field names come from the repository's `json/notification.json` and README table. Do NOT follow `postman/postman_collection.txt`, whose sample bodies are stale (`seconds` instead of `duration`, `text` instead of `message`, `appTitle`/`appIcon`/`color` instead of `source`/`smallIcon`/`smallIconColor`).

## Input Dependencies
None. The clients take primitive parameters and are deliberately decoupled from the threshold logic in task 1 so both can be built in parallel.

## Output Artifacts
- `packages/shared/src/notify/index.ts` (and any per-transport modules beside it).
- Updated `packages/shared/src/index.ts` re-exports.

## Implementation Notes

<details>
<summary>Detailed implementation guidance</summary>

Structure this like the existing `unifi/` directory: a small `index.ts` that re-exports, with the transports either inline or in `tvoverlay.ts` and `ntfy.ts` beside it.

The `Notifier` interface exists so the worker can hold a plain `Notifier[]` of whichever transports are configured and loop over it without branching per transport.

TvOverlay request:

```
POST {baseUrl}/notify
Content-Type: application/json
{"id":"screen-time-warning-15","title":"Screen time","message":"Internet turns off in 15 minutes",
 "smallIcon":"mdi:timer-sand","corner":"top_end","duration":15}
```

A stable `id` per threshold means a re-send of the same threshold replaces rather than stacks the overlay. A verified success response looks like `{"success":true,"message":"..."}`, but treat the HTTP status as the source of truth rather than parsing the body.

ntfy request:

```
POST {topicUrl}
Title: Screen time

Internet turns off in 15 minutes
```

The whole point of the boolean return is that the caller cannot be made to care. Wrap the entire body of each `send` in `try`/`catch`, return `false` from the catch, and make sure the timeout path lands in that same catch (an aborted `fetch` rejects with an `AbortError`).

Do not write unit tests here. Testing `fetch` against a stub verifies the framework, not this application's logic — the test philosophy excludes it, and the runnable failure check in the acceptance criteria covers the one contract that matters.
</details>
