---
id: 4
group: "unifi-integration"
dependencies: [1]
status: "pending"
created: 2026-08-07
skills:
  - typescript
  - rest-api
complexity_score: 5
complexity_notes: "External system with self-signed TLS and a PUT round-trip whose write-model fidelity must be proven live"
---
# UniFi Integration API client with live toggle proof

## Objective
Implement the shared UniFi client against the official Integration API and prove the full toggle round-trip against the live UDM Pro: fetch the firewall policy by ID, flip `enabled` via read-modify-write PUT, confirm, and restore. This is the plan's proof gate for the entire integration.

## Skills Required
`typescript` for the client; `rest-api` for the HTTP/auth/TLS specifics of the Integration API.

## Acceptance Criteria
- [ ] Client in `packages/shared/src/unifi/` with: configurable base URL (`https://<gateway>/proxy/network/integration`), `X-API-KEY` header auth on every request, and explicit handling of the gateway's self-signed certificate confined to this client (never process-wide).
- [ ] Operations: `getFirewallPolicy(siteId, policyId)` and `setFirewallPolicyEnabled(siteId, policyId, enabled)` — the latter GETs the policy, changes only `enabled`, strips read-only fields (`id`, `index`, `metadata`) per the spec's "Create or update firewall policy" schema, and PUTs the full object back. All other policy content (Kids-network targeting) passes through untouched.
- [ ] The client treats the policy body as opaque apart from `enabled`.
- [ ] A small proof CLI exists (e.g. `packages/shared/scripts/toggle-proof.ts`) that reads gateway URL / API key / site ID / policy ID from env, then: GETs the policy and prints `name` + `enabled`, flips it, re-GETs to confirm the flip, restores the original value, and confirms restoration.
- [ ] Runnable verification: `pnpm --filter shared exec tsx scripts/toggle-proof.ts` against the live UDM Pro prints the before/flip/restore sequence with matching `enabled` values and exits 0. (Requires the user's manually created Kids-network block policy ID and API key in the local env — see Implementation Notes.)

Use your internal Todo tool to track these and keep on track.

## Technical Requirements
- API contract: `docs/udm-api-openapi-spec.json` (UniFi Network API v10.5.67) — the authoritative reference. Auth via `X-API-KEY` header is already verified live (returns `{"applicationVersion":"10.5.67"}` from `GET /v1/info`).
- `PATCH` on the policy only supports `loggingEnabled` — do not use it; the toggle is GET → mutate `enabled` → `PUT /v1/sites/{siteId}/firewall/policies/{firewallPolicyId}`.
- Native `fetch` with an undici Agent (or equivalent) for the TLS trust exception scoped to this client only.
- No retry logic beyond surfacing errors — the worker's tick loop is the retry mechanism.

## Input Dependencies
Task 1: `packages/shared` skeleton. User-provided (not task-produced): API key, site ID, and the block policy ID in a local env file.

## Output Artifacts
UniFi client exported from `packages/shared` (consumed by the worker, task 5) plus the proof script demonstrating the round-trip.

## Implementation Notes
<details>
<summary>Detailed guidance</summary>

- Site ID discovery: `GET /v1/sites` returns the site list; the proof script may print sites/policies to help the user find IDs if the configured ones are missing, but the client itself takes IDs as config — it never discovers or creates policies (explicitly out of scope).
- Read-modify-write fidelity is the risk to burn down: compare the spec's read model ("Firewall policy") with the write model ("Create or update firewall policy") and send only writable fields. If the controller rejects the PUT, print the response body — the error envelope includes field-level detail.
- TLS: the UDM Pro serves a self-signed cert on the LAN. Use a dedicated dispatcher/agent with `rejectUnauthorized: false` (or a pinned CA if trivially available) passed per-request inside this client module only.
- Env for the proof run comes from `apps/worker/.env` conventions (task 5 formalizes them); for this task a `packages/shared/.env`-style local file or exported shell vars are fine — do not commit secrets. The user already holds the API key.
- Semantics: policy `enabled: true` ⇒ kids' internet OFF. Print this mapping in the proof output to avoid operator confusion.
- If the user has not yet created the block policy when this task executes, stop and ask for the policy ID rather than creating one — policy creation is explicitly the user's manual setup step.

</details>
