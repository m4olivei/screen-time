---
id: 3
group: "shared-package"
dependencies: [2]
status: "pending"
created: 2026-08-07
skills:
  - typescript
  - vitest
complexity_score: 5
complexity_notes: "Pure logic, but timezone/DST correctness and override precedence carry real edge cases"
---
# Desired-state function with unit tests

## Objective
Implement the pure desired-state function in `packages/shared` — given `now`, a profile's `ScheduleWindow`s, and its active `Override`s, return whether internet should be ON or OFF — with explicit override precedence and timezone-correct window evaluation, covered by unit tests for the edge cases the plan names.

## Skills Required
`typescript` for the pure logic; `vitest` for the unit tests.

## Acceptance Criteria
- [ ] A pure function (no DB, no network, injectable `now` and timezone) computes ON/OFF from windows + overrides and is exported from the shared package.
- [ ] Override semantics implemented as the plan defines: `extend` pushes the current/most recent allowed window's cutoff to `effectiveUntil`; `allow_now`/`block_now` force the state until `effectiveUntil` regardless of schedule; expired overrides are ignored. Precedence between simultaneous overrides is explicit and documented in code (most recently created active override wins).
- [ ] Window evaluation uses the household's configured IANA timezone explicitly, not the process default.
- [ ] Tests cover: inside/outside a window, exact start/end boundary minutes, midnight-adjacent windows, each override type overriding the schedule, expired overrides being ignored, override-vs-override precedence, and behavior across a DST transition date (spring-forward and fall-back) with a non-UTC zone while the "system" zone differs.
- [ ] Runnable verification: `pnpm --filter shared test` runs Vitest and all tests pass.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- Function signature approximately: `computeDesiredState(input: { now: Date; timeZone: string; windows: ScheduleWindow[]; overrides: Override[] }): 'ON' | 'OFF'`.
- Local-time math via `Intl.DateTimeFormat`/`Date` with the given `timeZone` (no heavyweight date library unless genuinely needed; if one is needed, prefer a single small, standard one).
- Vitest as the shared package's test runner (add it here, not in task 1).
- Entity types imported from task 2's layer; the function must not touch the data source.

## Input Dependencies
Task 2: `ScheduleWindow` and `Override` entity types.

## Output Artifacts
`computeDesiredState` (plus any small time helpers) exported from `packages/shared`, consumed by the worker (task 5) and the web app's status display (task 6).

## Implementation Notes
<details>
<summary>Detailed guidance</summary>

- Convert `now` to the target timezone's wall-clock (day-of-week + minutes-since-midnight) once, then compare against windows numerically. Boundary rule: a window covers `[startMinute, endMinute)`.
- `extend` needs the notion of "tonight's cutoff": the window currently active or the one that most recently ended today; extending pushes the OFF transition to `effectiveUntil`. If no window is relevant, treat `extend` like `allow_now` until `effectiveUntil` (simplest defensible semantics — document it).
- Keep precedence in ONE place with a comment block stating the rules; the UI and worker must never re-implement any of this.

**Test philosophy (apply as written):** write a few tests, mostly integration-style over the function's real scenarios. Meaningful tests verify custom business logic, critical paths, and edge cases specific to this application — test *your* code, not the framework. DO test: the schedule/override decision logic, boundary minutes, DST transitions, precedence. DO NOT test: TypeORM behavior, trivial getters, or framework features. Combine related scenarios into table-driven cases rather than one test file per rule.

</details>
