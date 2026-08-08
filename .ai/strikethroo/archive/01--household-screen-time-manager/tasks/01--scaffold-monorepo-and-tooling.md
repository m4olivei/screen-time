---
id: 1
group: "project-setup"
dependencies: []
status: "completed"
created: 2026-08-07
skills:
  - pnpm-workspace
  - sveltekit
complexity_score: 4
complexity_notes: "Mechanical setup but spans workspace config, SvelteKit creation, Tailwind, shadcn-svelte, and Prettier in one pass"
---
# Scaffold pnpm monorepo and frontend tooling

## Objective
Create the complete repository skeleton: a pnpm workspace with `packages/shared`, `apps/web` (SvelteKit), and `apps/worker`, shared TypeScript configuration with TypeORM decorator support, and the locked frontend tooling (Tailwind CSS via `@tailwindcss/vite` with forms/typography plugins, shadcn-svelte initialized, Prettier with `prettier-plugin-tailwindcss` at the workspace root).

## Skills Required
`pnpm-workspace` for the monorepo wiring; `sveltekit` for creating the web app with its Vite/Tailwind/shadcn-svelte toolchain.

## Acceptance Criteria
- [ ] Repo layout matches the plan: root `package.json` + `pnpm-workspace.yaml`, `tsconfig.base.json`, `packages/shared/`, `apps/web/`, `apps/worker/`, each with its own `package.json`; both apps depend on the shared package via `workspace:*`.
- [ ] `tsconfig.base.json` enables `experimentalDecorators` and `emitDecoratorMetadata`; package tsconfigs extend it.
- [ ] `pnpm install` completes cleanly from the repo root.
- [ ] `pnpm --filter web dev` starts the SvelteKit dev server; a page styled with Tailwind utility classes renders (verify by fetching `http://localhost:5173` with curl and seeing HTML output).
- [ ] `apps/web/vite.config.ts` uses `@tailwindcss/vite`; the Tailwind CSS entry includes `@tailwindcss/forms` and `@tailwindcss/typography` plugins; shadcn-svelte is initialized (its `components.json` and utils file exist) and at least one shadcn-svelte component (e.g. Button) renders on the placeholder page.
- [ ] `pnpm exec prettier --check .` runs from the root using a root Prettier config that includes `prettier-plugin-tailwindcss`, and passes on the scaffolded code.
- [ ] `apps/worker/src/index.ts` and `packages/shared/src/index.ts` exist as compilable stubs; `pnpm -r exec tsc --noEmit` (or equivalent per-package typecheck script) passes.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- pnpm workspace (`pnpm-workspace.yaml` listing `packages/*` and `apps/*`).
- SvelteKit created via the current official scaffolder (`npx sv create` / `pnpm create svelte`) with TypeScript.
- Tailwind CSS v4-style integration through the `@tailwindcss/vite` plugin (not PostCSS config), plus official `@tailwindcss/forms` and `@tailwindcss/typography`.
- shadcn-svelte initialized per its official CLI for SvelteKit + Tailwind v4.
- Prettier configured once at the workspace root with `prettier-plugin-tailwindcss` (and the Svelte Prettier plugin so `.svelte` files format).
- TypeORM decorator prerequisites in `tsconfig.base.json`: `experimentalDecorators: true`, `emitDecoratorMetadata: true`, `strict` on.

## Input Dependencies
None — first task in the plan.

## Output Artifacts
The complete workspace skeleton every other task builds inside: `packages/shared` (stub), `apps/web` (running SvelteKit app with Tailwind + shadcn-svelte), `apps/worker` (stub), shared TS config, root Prettier config.

## Implementation Notes
<details>
<summary>Detailed guidance</summary>

- Create the root `package.json` with `"private": true` and workspace scripts (`dev`, `build`, `format`, `check`). `pnpm-workspace.yaml` lists `packages/*` and `apps/*`.
- Scaffold the SvelteKit app inside `apps/web` (choose the minimal/skeleton template, TypeScript). Then add Tailwind: install `tailwindcss`, `@tailwindcss/vite`, `@tailwindcss/forms`, `@tailwindcss/typography`; add the Vite plugin to `vite.config.ts`; create the CSS entry with `@import "tailwindcss";` and `@plugin "@tailwindcss/forms";` / `@plugin "@tailwindcss/typography";` (Tailwind v4 style), imported from the root layout.
- Initialize shadcn-svelte with its CLI (`pnpm dlx shadcn-svelte@latest init`) after Tailwind works; add a Button component and place it on the index page as proof.
- `apps/worker`: plain Node + TypeScript package with `src/index.ts` stub (e.g. logs "worker stub" and exits), `tsx` or `tsc`-based dev/build scripts.
- `packages/shared`: TypeScript package exporting from `src/index.ts`; no runtime logic yet. Configure it so both apps can import source directly (either build step or TS path/workspace resolution — pick the simplest that lets `pnpm -r` typecheck pass; a plain `tsc` build with `dist/` output and `main`/`types` fields is the least clever option).
- Root Prettier config (e.g. `.prettierrc`) with `plugins: ["prettier-plugin-svelte", "prettier-plugin-tailwindcss"]` (tailwindcss plugin must be last) and a `.prettierignore` covering build output.
- Do NOT add: ESLint (not in plan), test runners (come with task 3), PWA plugin (task 8), TypeORM packages (task 2).

</details>
