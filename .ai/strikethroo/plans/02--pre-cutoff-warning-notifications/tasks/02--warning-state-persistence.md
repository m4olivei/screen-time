---
id: 2
group: "shared-package"
dependencies: []
status: "completed"
created: 2026-08-18
skills:
  - typeorm
  - sqlite
complexity_score: 4
---
# Warning State Entity and Query Helpers

## Objective
Add the persistence that makes "warn once" survive a worker restart: a TypeORM entity recording one row per handled `(profileId, cutoff, threshold)` triple, registered in the shared data source, with the query helpers the worker needs to read, record, and prune.

## Skills Required
`typeorm` for the entity definition, unique constraint, and repository helpers; `sqlite` for verifying the generated schema and index on the real database file.

## Acceptance Criteria
- [ ] `packages/shared/src/db/entities/WarningLog.ts` defines a `WarningLog` entity with `id` (generated), `profileId` (integer), `cutoffAt` (datetime), `thresholdMinutes` (integer), and `handledAt` (`@CreateDateColumn`).
- [ ] A unique constraint spans `(profileId, cutoffAt, thresholdMinutes)`.
- [ ] `WarningLog` is added to the `entities` array in `packages/shared/src/db/data-source.ts`.
- [ ] `packages/shared/src/db/queries.ts` exports `getHandledThresholds(dataSource, profileId, cutoffAt): Promise<number[]>`, `recordHandledThresholds(dataSource, profileId, cutoffAt, thresholdMinutes: number[]): Promise<void>`, and `pruneWarningLog(dataSource, now): Promise<number>` which deletes rows whose `cutoffAt` is at or before `now` and returns the count.
- [ ] All three helpers plus the entity are re-exported from `packages/shared/src/db/index.ts`.
- [ ] `recordHandledThresholds` is safe to call with a threshold already recorded — it must not throw on the unique constraint. Verify by calling it twice with the same arguments and observing no error and no duplicate row.
- [ ] Concrete schema check: create a throwaway database and confirm the table and unique index exist, e.g. `pnpm --filter @screen-time/shared exec tsx -e "import {createDataSource} from './src/db/index.js'; await createDataSource('/tmp/warnlog-check.sqlite');"` followed by `sqlite3 /tmp/warnlog-check.sqlite ".schema"`, whose output must include the `warning_log` table and a UNIQUE index over the three columns.
- [ ] `pnpm run check` exits 0.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- Follow the existing entity style in `packages/shared/src/db/entities/Override.ts`: decorators, explicit column types, a docblock explaining the semantics.
- Follow the existing helper style in `packages/shared/src/db/queries.ts`, including the `pruneExpiredOverrides` pattern for the prune helper (return `result.affected ?? 0`).
- Schema creation relies on the existing `synchronize: true` in the data source; do not add migrations.
- `cutoffAt` is stored as a `datetime` and is part of the identity of a warning ladder — an override that moves the cutoff produces a different `cutoffAt` and therefore re-arms every threshold. Document this in the entity docblock.

## Input Dependencies
None. This task is self-contained within `packages/shared`.

## Output Artifacts
- `packages/shared/src/db/entities/WarningLog.ts`.
- Updated `packages/shared/src/db/data-source.ts` (entity registration).
- Updated `packages/shared/src/db/queries.ts` and `packages/shared/src/db/index.ts`.

## Implementation Notes

<details>
<summary>Detailed implementation guidance</summary>

Use `@Entity()` with a `@Unique(['profileId', 'cutoffAt', 'thresholdMinutes'])` class decorator, mirroring the column style already used by `Override`.

A row means **handled**, not **delivered**. Thresholds suppressed for staleness are recorded too, because the point is never to revisit them. Say so in the docblock so a future reader does not mistake the table for a delivery log.

`recordHandledThresholds` takes an array because a single tick can hand back several thresholds at once (one sent, the rest suppressed). Make it tolerant of duplicates — either use `repository.upsert(rows, ['profileId', 'cutoffAt', 'thresholdMinutes'])` or an `insert().orIgnore()` builder. A duplicate must be a no-op, never an exception, because a crash between recording and the next tick could otherwise wedge the worker.

`getHandledThresholds` returns a plain `number[]` so it can be passed straight into `computeDueWarnings` from task 1 without adapting shapes at the call site.

`pruneWarningLog` mirrors `pruneExpiredOverrides` exactly: `delete({ cutoffAt: LessThanOrEqual(now) })`, returning the affected count. Once a cutoff is in the past its ladder can never fire again, so those rows are pure garbage.

Do not write unit tests for this task — it is TypeORM configuration and thin repository wrappers, which the test philosophy explicitly excludes. The schema check in the acceptance criteria is the verification.
</details>
