---
id: 9
group: "documentation"
dependencies: [5, 7, 8]
status: "pending"
created: 2026-08-07
skills:
  - technical-writing
complexity_score: 2
---
# Setup README and AGENTS.md

## Objective
Write the repository's human documentation (README.md) and AI-facing documentation (AGENTS.md, with CLAUDE.md pointing at it), covering the manual UniFi prerequisites, environment setup, deployment, and the project's binding invariants.

## Skills Required
`technical-writing` — accurate, checklist-style docs derived from the implemented system.

## Acceptance Criteria
- [ ] README.md covers: what the system is (one paragraph + the three-piece architecture), the manual UniFi setup checklist (create the Kids-network block policy with **no schedule** — source: Kids network, destination: external, action Block; generate the API key; collect site ID and policy ID), per-package env setup (`cp .env.example .env` for `apps/worker` and `apps/web`, variable-by-variable explanation), pnpm install/build/run, systemd install+enable steps for the worker on the Pi, and install-to-home-screen steps for iOS (Safari → Share → Add to Home Screen) and Android.
- [ ] README states the rule semantics (policy enabled ⇒ internet OFF) and that the app is the sole owner of the policy's enabled flag (hand-toggling in UniFi gets reverted within seconds).
- [ ] AGENTS.md records: monorepo layout, the invariants (worker is the sole UniFi caller; no app↔worker poke channel; SQLite is the only shared state; no push notifications), pointer to `docs/udm-api-openapi-spec.json` as the API reference, and the locked technology decisions so future AI work does not relitigate them. CLAUDE.md references AGENTS.md.
- [ ] Runnable verification: every command quoted in the README (pnpm scripts, systemd commands, cp steps) matches a script/file that actually exists in the repo — verify each by running the safe ones (`pnpm install`, builds) and path-checking the rest (`test -f`); no dead references.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- Documents the system as built by tasks 1–8 — verify details (env var names, script names, unit file path) against the code rather than the plan.
- Never include real secrets; reference `.env.example` placeholders only.

## Input Dependencies
Task 5 (worker env vars + systemd unit), task 7 (complete web app), task 8 (PWA install behavior).

## Output Artifacts
README.md, AGENTS.md, CLAUDE.md at the repo root — the final deliverable of the plan.

## Implementation Notes
<details>
<summary>Detailed guidance</summary>

- Keep the README task-oriented (setup checklist ordering matches the plan's build order); a household member never reads it — the audience is the technical owner and future maintainers.
- AGENTS.md is the guard rail: list the "do not add" items from the plan (push notifications, poke channel, UniFi calls from web, in-UniFi schedules, policy creation/discovery, connection-OK check) verbatim so future assistants inherit them.
- No other docs: no CONTRIBUTING, no architecture deep-dives, no changelogs — the plan names README and AGENTS.md/CLAUDE.md only.

</details>
