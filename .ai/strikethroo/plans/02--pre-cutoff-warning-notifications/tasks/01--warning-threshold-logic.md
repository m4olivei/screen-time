---
id: 1
group: "shared-package"
dependencies: []
status: "completed"
created: 2026-08-18
skills:
  - typescript
  - vitest
complexity_score: 4
---
# Warning Threshold Logic and Message Formatting

## Objective
Add a pure, dependency-free module to `packages/shared` that decides which pre-cutoff warning is due on a given tick, and formats the text and display duration for a threshold. This is the single authority for warning timing, mirroring how `desired-state.ts` is the single authority for ON/OFF.

## Skills Required
`typescript` for the pure logic and exported types; `vitest` for the colocated unit tests that encode the staleness and one-per-tick rules.

## Acceptance Criteria
- [ ] `packages/shared/src/warnings.ts` exists and exports `WARNING_THRESHOLDS_MINUTES` equal to `[30, 15, 10, 5, 2, 1]`.
- [ ] It exports `describeWarning(thresholdMinutes)` returning `{ title, message, durationSeconds }`, where `describeWarning(15)` gives message `Internet turns off in 15 minutes` and `durationSeconds` `15`, and `describeWarning(1)` gives message `Internet turns off in 1 minute` (singular) and `durationSeconds` `60`. The title is `Screen time` for every threshold.
- [ ] It exports `computeDueWarnings({ now, cutoff, handledThresholds, graceMs })` returning `{ send: number | null, handle: number[] }`.
- [ ] Staleness suppression: a threshold that came due longer ago than `graceMs` appears in `handle` and never in `send`.
- [ ] One-per-tick: when several thresholds are simultaneously eligible within the grace period, only the smallest is returned in `send`; the others appear in `handle`.
- [ ] A threshold present in `handledThresholds` is never returned in either `send` or `handle`.
- [ ] A threshold whose due moment is still in the future appears in neither array.
- [ ] `packages/shared/src/warnings.test.ts` covers each of the five rules above, including a restart scenario (worker resumes with 4 minutes remaining and nothing handled: 30/15/10/5 are handled silently and only 2 is a candidate once it comes due).
- [ ] `pnpm --filter @screen-time/shared test` exits 0 and its output lists `warnings.test.ts`.
- [ ] `pnpm run check` exits 0.
- [ ] The new exports are re-exported from `packages/shared/src/index.ts`.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- Pure functions only: no database access, no network, no `new Date()` or `Date.now()` inside the module — `now` is always an input, exactly as `computeDesiredState` and `computeNextTransition` do it.
- The module must NOT read schedule windows or overrides and must NOT compute the cutoff itself. The cutoff instant is an input, supplied by the caller from `computeNextTransition`. This preserves the single-authority rule recorded in `AGENTS.md`.
- Default `graceMs` to 60000 (60 seconds) via an exported constant so the worker does not hard-code it.
- Follow the file style of `packages/shared/src/next-transition.ts`: a module docblock explaining the method, named exports, explicit interfaces for inputs.

## Input Dependencies
None. This task is self-contained within `packages/shared`.

## Output Artifacts
- `packages/shared/src/warnings.ts` — `WARNING_THRESHOLDS_MINUTES`, `WARNING_GRACE_MS`, `describeWarning`, `computeDueWarnings`, and their input/output types.
- `packages/shared/src/warnings.test.ts`.
- Updated `packages/shared/src/index.ts` re-exports.

## Implementation Notes

<details>
<summary>Detailed implementation guidance</summary>

A threshold `T` (in minutes) comes due at `cutoff - T * 60_000`. On each call:

1. Build the candidate list from `WARNING_THRESHOLDS_MINUTES`, excluding any threshold already in `handledThresholds`.
2. Keep only candidates whose due moment is at or before `now` (`dueAt <= now`). Future thresholds are ignored entirely.
3. Split the remaining candidates: those with `now - dueAt <= graceMs` are *fresh*; the rest are *stale*.
4. `send` is the smallest fresh candidate, or `null` when there are none. Every other candidate from step 2 — all stale ones plus any fresh ones that lost the smallest-wins comparison — goes into `handle`.
5. The chosen `send` threshold must also appear in `handle`, because the caller records everything in `handle` as dealt with. Alternatively return `handle` as the complete set including `send`; whichever shape you choose, document it clearly in the docblock and make the tests assert it, because the worker depends on recording every returned threshold.

Rule 4 is what prevents a worker that restarts at 4 minutes remaining from firing 30, 15, 10 and 5 as a burst: all four are stale, so all four are handled silently and none is sent.

`describeWarning` pluralisation is a simple `minutes === 1 ? 'minute' : 'minutes'`. Duration is `thresholdMinutes === 1 ? 60 : 15` seconds.

**Test philosophy — "write a few tests, mostly integration".**

*Definition.* Meaningful tests verify custom business logic, critical paths, and edge cases specific to this application. Test *your* code, not the framework or library.

*When TO write tests:* custom business logic and algorithms; critical user workflows and data transformations; edge cases and error conditions for core functionality; integration points between components; complex validation logic or calculations.

*When NOT to write tests:* third-party library functionality; framework features; simple CRUD operations without custom logic; trivial getters/setters or static configuration; obvious functionality that would break immediately if incorrect.

*Test task creation rules:* combine related test scenarios into a single task rather than splitting per method; favor integration and critical-path coverage over per-method unit tests; avoid one test task per CRUD operation; question whether simple functions need a dedicated test task.

Applied here: the threshold selection rules ARE the custom business logic and deserve real coverage. Do not write tests for TypeORM, `fetch`, or the shape of the exported constant.
</details>
