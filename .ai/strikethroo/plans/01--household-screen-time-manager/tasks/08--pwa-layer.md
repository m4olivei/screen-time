---
id: 8
group: "web-app"
dependencies: [6]
status: "pending"
created: 2026-08-07
skills:
  - vite-pwa
complexity_score: 3
---
# PWA layer (manifest + service worker)

## Objective
Make the web app installable to iOS and Android home screens, launching fullscreen, using the Vite PWA plugin. Explicitly no push notifications.

## Skills Required
`vite-pwa` — plugin configuration, web manifest, and service worker registration within SvelteKit.

## Acceptance Criteria
- [ ] `@vite-pwa/sveltekit` (the SvelteKit integration of the Vite PWA plugin) is configured with a web manifest: app name, short name, icons (192/512 + maskable), `display: "standalone"`, theme/background colors.
- [ ] A service worker is generated and registered in production builds; the app shell loads when revisited.
- [ ] iOS-specific head tags are present where the plugin doesn't cover them (`apple-touch-icon`, status-bar meta) so "Add to Home Screen" launches fullscreen.
- [ ] No push notification code, permission prompts, or web-push dependencies anywhere.
- [ ] Runnable verification: after `pnpm --filter web build && pnpm --filter web preview`, `curl -s http://localhost:4173/manifest.webmanifest` returns the manifest JSON with `"display":"standalone"`, and the service worker script URL returns 200; a Lighthouse/devtools installability check (or playwright-driven equivalent) reports the app installable.

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- Vite PWA plugin in `apps/web/vite.config.ts` alongside the existing Tailwind plugin.
- Generated icons committed under `apps/web/static/` (simple generated glyph icons are fine — no design work in scope).
- Service worker strategy: default generateSW/autoUpdate is sufficient; the app is a live dashboard, so avoid caching strategies that would show stale status for long (network-first or short-lived caching for page data).

## Input Dependencies
Task 6: the working app to wrap (task 7's editor benefits automatically).

## Output Artifacts
Installable PWA build; consumed by task 9's install-to-home-screen documentation.

## Implementation Notes
<details>
<summary>Detailed guidance</summary>

- Remember the plan's note: iOS only enables install behavior via Safari's manual "Add to Home Screen" — nothing to code for it beyond correct manifest + meta tags; the documentation step lands in task 9.
- Keep scope tight: manifest, icons, SW registration, fullscreen launch. No offline data features, no background sync, no update-available toasts.

</details>
