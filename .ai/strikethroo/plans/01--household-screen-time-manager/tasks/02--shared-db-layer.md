---
id: 2
group: "shared-package"
dependencies: [1]
status: "completed"
created: 2026-08-07
skills:
  - typeorm
  - sqlite
complexity_score: 4
---
# Shared TypeORM data layer (SQLite)

## Objective
Implement the database layer in `packages/shared`: a TypeORM data source backed by SQLite, the `Profile`, `ScheduleWindow`, and `Override` entities, and the basic queries both the web app and worker need. This makes SQLite the single source of truth shared by both processes.

## Skills Required
`typeorm` for the data source/entities/queries; `sqlite` for the storage engine specifics (file path config, WAL mode).

## Acceptance Criteria
- [ ] Entities exist with the plan's fields: `Profile` (`id`, `name`, `unifiRuleId`), `ScheduleWindow` (`id`, `profileId`, `dayOfWeek` 0–6, `startMinute`, `endMinute`), `Override` (`id`, `profileId`, `type` ∈ `extend`|`allow_now`|`block_now`, `effectiveUntil`, `createdAt`).
- [ ] A factory creates the data source from a configurable SQLite file path (env-provided by callers) and enables WAL mode.
- [ ] Query helpers exist for: get all profiles, get a profile's schedule windows, get a profile's active (non-expired) overrides, create/extend an override, prune expired overrides, and CRUD for schedule windows.
- [ ] Schema creation works against a local SQLite file (TypeORM `synchronize` or migrations — pick one and be consistent).
- [ ] Runnable verification: a small script (e.g. `packages/shared/scripts/db-smoke.ts`, run via `pnpm --filter shared exec tsx scripts/db-smoke.ts` with a temp DB path) creates the schema, inserts a Profile + one ScheduleWindow + one Override, reads them back, and prints them; `sqlite3 <tempfile> ".tables"` lists the three tables.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- TypeORM with the SQLite driver (`better-sqlite3` driver preferred for a synchronous, dependency-light setup; `sqlite3` acceptable).
- Decorator-based entities relying on the base tsconfig from task 1.
- `Override.type` as a string union/enum matching the plan exactly.
- Exported from `packages/shared` index so `apps/web` and `apps/worker` import entities and queries from one place.

## Input Dependencies
Task 1: workspace skeleton, `packages/shared` stub, decorator-enabled TS config.

## Output Artifacts
`packages/shared/src/db/` — data source factory, entities, query helpers, all exported from the package index. Consumed by tasks 3, 5, 6, 7.

## Implementation Notes
<details>
<summary>Detailed guidance</summary>

- Keep it to three entities; no extra tables, no soft-delete, no audit columns — the plan calls these a starting point, so implement exactly what it names.
- Data source factory signature like `createDataSource(dbPath: string): DataSource`; callers pass the path from their own env (`.env` handling lives in the apps, not here).
- Enable WAL with a post-initialize `PRAGMA journal_mode=WAL;` query.
- "Active override" = `effectiveUntil > now`; write the helper once here so web and worker share the definition.
- Semantics reminder for later consumers (document in code where relevant): when the UniFi rule is **enabled**, internet is **off**; the `unifiRuleId` field holds the firewall policy ID the user created manually.
- If you use `synchronize: true`, note it in the data source factory comment as the deliberate greenfield choice.

</details>
