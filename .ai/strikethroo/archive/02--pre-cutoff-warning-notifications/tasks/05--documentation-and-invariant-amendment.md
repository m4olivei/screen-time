---
id: 5
group: "documentation"
dependencies: [4]
status: "completed"
created: 2026-08-18
skills:
  - technical-writing
  - markdown
complexity_score: 3
---
# Documentation and the AGENTS.md Invariant Amendment

## Objective
Record the feature in the three places that govern this repository: amend the `AGENTS.md` no-push-notifications invariant to what was actually decided rather than reversing it, document setup and client installation in `README.md`, and add the two new variables to `apps/worker/.env.example` as placeholders only.

## Skills Required
`technical-writing` for the invariant amendment and the setup prose; `markdown` for the table and section edits across the three files.

## Acceptance Criteria
- [x] `AGENTS.md` no longer bans push notifications outright. The invariant is narrowed to state that the **PWA** still ships no web push and that no app-to-worker notification channel exists, while the **worker** may send outbound notifications to configured endpoints.
- [x] The `Do not add` list in `AGENTS.md` replaces the bare "push notifications" entry with the narrower "web push in the PWA" and keeps the app-to-worker channel prohibition intact.
- [x] `AGENTS.md` Key Semantics gains an entry for the warning-threshold module, stating that it consumes `computeNextTransition` and must never re-derive cutoffs itself.
- [x] `AGENTS.md` notes the worker's two new outbound integrations where the worker is described, so "the worker is the sole UniFi caller" is not misread as "the sole HTTP caller".
- [x] `README.md` adds `NTFY_TOPIC_URL` and `TVOVERLAY_URL` to the `apps/worker/.env` table, both marked optional with the disabled-when-unset behaviour stated.
- [x] `README.md` gains a setup section covering: generating a high-entropy ntfy topic and why the topic name must be treated as a secret (it grants publish rights, not just subscribe); per-platform client installation with the **PWA preferred on desktop** — macOS Safari on Sonoma 14+ via Share then Add to Dock, or Chrome via the address-bar install icon; Windows via Chrome or Edge's install icon; iOS Safari via Share then Add to Home Screen; Android via the first-party Play Store app.
- [x] That section states plainly that a desktop only receives while its browser or the installed PWA is running, and that warnings are advisory — enforcement is unaffected if a device mutes, blocks, or uninstalls a client.
- [x] `README.md` documents the TvOverlay setup on the Bravia: install from the Play Store, grant the draw-over-other-apps permission (including the `adb shell appops set com.tabdeveloper.tvoverlay SYSTEM_ALERT_WINDOW allow` fallback), disable battery optimization via `adb shell dumpsys deviceidle whitelist +com.tabdeveloper.tvoverlay`, and set a DHCP reservation for the TV.
- [x] `apps/worker/.env.example` gains both variables, commented, with placeholder values only.
- [x] Concrete check: `grep -n 'NTFY_TOPIC_URL\|TVOVERLAY_URL' README.md apps/worker/.env.example` returns matches in both files.
- [x] Concrete check: grepping the deliverable surfaces (`README.md`, `AGENTS.md`, `apps/worker/.env.example`, `packages/`, `apps/`) for the real TV address or the household domain returns no matches — real values must never be committed, only placeholders.
- [x] `pnpm run format` leaves the three files unchanged (run it, then confirm `git diff --stat` shows no further formatting churn).

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- The amendment must be an amendment, not a deletion. `AGENTS.md` opens by saying the recorded decisions must not be relitigated, so the edit should read as a deliberate narrowing with its reasoning visible, not as though the ban never existed.
- Placeholder values only in committed files. The real ntfy topic and the real Bravia address exist solely in the Pi's `apps/worker/.env`.
- Match the existing documentation voice: `README.md` is human-facing setup and operations; `AGENTS.md` is terse, binding, and written for AI tooling.

## Input Dependencies
- Task 4 establishes the final variable names, the disabled-when-unset behaviour, and the startup log wording that this documentation describes.

## Output Artifacts
- Updated `AGENTS.md`, `README.md`, and `apps/worker/.env.example`.

## Implementation Notes

<details>
<summary>Detailed implementation guidance</summary>

The current `AGENTS.md` invariant reads:

> **No push notifications.** The PWA is installable but deliberately excludes push.

The first sentence is now wrong and the second is still true. Rewrite so the surviving constraint and the new permission are both explicit — something in the shape of: the PWA remains installable and deliberately excludes web push; the worker may send outbound notifications to configured endpoints (TvOverlay on the LAN, ntfy.sh); there is still no app-to-worker channel and no notification path through the web app.

For the ntfy topic, suggest generating the name rather than inventing one by hand, for example `echo "screen-time-$(openssl rand -hex 8)"`. State explicitly that a name derived from the household domain is unsafe because anyone who can guess the topic can publish to it, which would let a third party inject fake warnings.

The desktop-delivery caveat is the single most important sentence for whoever installs this, because it is silent when it fails: the ntfy tab may be closed, but the browser or the installed PWA must be running for a laptop to receive anything. Put it where someone installing the PWA will read it, not in a footnote.

For the TvOverlay ADB commands, note that on many TVs the draw-over-other-apps toggle is simply absent from the settings UI, which is why the `appops` fallback is documented rather than optional.
</details>

## Verification note (task 5)

The no-personal-values gate passes for every file this task
touches and for all committed source and docs: scoped to `-- . ':!.ai'` it exits 1 with no output,
as it does scoped to `README.md AGENTS.md apps/worker/.env.example`. Repo-wide it still reports
three hits, all pre-existing and all inside `.ai/`: two in
`plan-02--pre-cutoff-warning-notifications.md` (the verbatim Original Work Order quote and the
clarification row that rejects that domain as a topic name) and one in this task file (the grep
pattern itself, which necessarily matches). No new personal value was introduced.
