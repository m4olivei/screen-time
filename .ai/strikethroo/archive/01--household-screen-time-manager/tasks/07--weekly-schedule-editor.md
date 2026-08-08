---
id: 7
group: "web-app"
dependencies: [2, 6]
status: "completed"
created: 2026-08-07
skills:
  - sveltekit
  - shadcn-svelte
complexity_score: 5
---
# Weekly schedule editor

## Objective
Build the schedule editor page: view and edit a profile's recurring weekly allowed windows (`ScheduleWindow` rows — day of week, start, end). May be denser than the status screen since the technical owner uses it, but must stay legible.

## Skills Required
`sveltekit` for the CRUD form actions; `shadcn-svelte` for form controls.

## Acceptance Criteria
- [ ] A schedule page lists a profile's windows grouped by day (0–6), showing start/end as local times.
- [ ] Windows can be added, edited, and deleted via server-side form actions using the shared query helpers; times entered as HH:MM are stored as minutes-since-midnight.
- [ ] Server-side validation rejects `endMinute <= startMinute` and out-of-range values with a visible error message (overlapping windows are allowed — the desired-state function treats them as a union).
- [ ] Navigation exists between the status screen and the editor.
- [ ] Runnable verification: with the dev server running, add a window for day 3 from 16:00 to 20:00 through the UI (or its form action via curl), then `sqlite3 <db> "select dayOfWeek, startMinute, endMinute from schedule_window;"` shows `3|960|1200`; edit it to 21:00 and the row shows `1260`; delete it and the row is gone; each change is reflected on the reloaded page.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- Reuses the layout, env, and DB access patterns established in task 6; `@tailwindcss/forms` styling for native time inputs where used.
- Multiple windows per day are supported (the schedule is composed of rows, per the plan's data model).
- No schedule logic beyond storage/validation lives here — evaluation belongs to the shared desired-state function.

## Input Dependencies
Task 2 (ScheduleWindow entity + CRUD helpers), task 6 (app layout, env conventions, navigation shell).

## Output Artifacts
The schedule editor page completing the web app's feature set; consumed by task 8 (PWA wrap) and task 9 (docs screenshots/instructions if referenced).

## Implementation Notes
<details>
<summary>Detailed guidance</summary>

- A simple per-day list with an add-window row per day is enough; avoid drag-and-drop timeline widgets — "slightly more involved" does not mean complex.
- Use `<input type="time">` (styled by `@tailwindcss/forms`) for start/end; convert to minutes server-side.
- Deleting the last window of a day simply means internet is off that whole day (outside all windows ⇒ OFF) — surface that consequence with a small helper text line.
- Keep the editor per-profile but don't build profile management UI — the single "Kids" profile is seeded data; no create/delete-profile screens (not in the plan).

</details>
