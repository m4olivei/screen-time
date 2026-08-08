---
id: 6
group: "web-app"
dependencies: [2, 3]
status: "completed"
created: 2026-08-07
skills:
  - sveltekit
  - shadcn-svelte
complexity_score: 5
---
# Status view and override buttons

## Objective
Build the web app's primary screen: an at-a-glance status per profile ("Kids' internet: ON until 8:00 PM" / "OFF") and big one-tap controls — **+15 min**, **+5 min**, **Pause now**, **Allow now** — that write Override rows via server-side form actions. Optimized for a non-technical user on an iPhone.

## Skills Required
`sveltekit` for load functions/form actions; `shadcn-svelte` for the touch-friendly components.

## Acceptance Criteria
- [ ] The index page server-loads profiles and computes current status with the shared `computeDesiredState` (including the "until …" time derived from windows/overrides); no state logic re-implemented client-side.
- [ ] Four large buttons per profile: +15 min and +5 min create-or-extend an `extend` override; Pause now creates a `block_now` override; Allow now creates an `allow_now` override — each via a SvelteKit form action that writes through the shared query helpers (works without client-side JS).
- [ ] Pause/Allow override duration follows the plan's semantics (`effectiveUntil` required): use a sensible fixed horizon surfaced in the UI (e.g. "until next schedule change") — implement one clear behavior and label the buttons accordingly.
- [ ] All database writes happen server-side; no UniFi code or credentials are imported anywhere in `apps/web` (verify: `grep -r "unifi" apps/web/src` returns only nothing or type-level status labels).
- [ ] Mobile-first layout using shadcn-svelte components and Tailwind; controls are comfortably tappable on a phone-width viewport.
- [ ] Runnable verification: with the dev server running and a seeded profile, `curl -s http://localhost:5173/` shows the status text; submitting the +15 form (via the browser or `curl -X POST` to the action) creates/extends an `extend` Override row observable with `sqlite3 <db> "select type, effectiveUntil from override;"`, and the reloaded page reflects the new cutoff.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- SvelteKit `+page.server.ts` load + form actions; SQLite path and timezone from the web app's env (per-package `.env`, spec'd by a committed `apps/web/.env.example` since this is the first task needing web env).
- Status wording mirrors the plan: "ON until <time>" when a window/override end is known, otherwise plain ON/OFF; note that changes take effect within seconds (worker tick).
- "+15/+5 create-or-extend": if an active `extend` override exists, push its `effectiveUntil` further; otherwise create one anchored to the current cutoff (shared helper from task 2/3 owns the anchor math).

## Input Dependencies
Task 2 (entities/queries), task 3 (`computeDesiredState` for status display). Task 1's app shell with Tailwind + shadcn-svelte.

## Output Artifacts
The main screen of the PWA: status display + override actions, plus `apps/web/.env.example`. Base UI that task 7 (schedule editor) and task 8 (PWA) build on.

## Implementation Notes
<details>
<summary>Detailed guidance</summary>

- This screen is the product for the primary persona — favor big type, one column, generous tap targets (shadcn-svelte Button `size="lg"` or larger, Card per profile).
- Compute "until when" server-side: the next transition time given windows + overrides (walk the shared logic's view of the day; keep this helper in `packages/shared` next to `computeDesiredState` so the worker and UI can never disagree).
- Use progressive enhancement (`use:enhance`) so taps feel instant, but the actions must work without JS.
- Keep the page self-refreshing simply (e.g. `invalidateAll` after action + optional short polling) — no websockets, no push.
- Do not add: authentication/login, multi-user accounts, or a UniFi connection indicator (all explicitly out of scope).

</details>
