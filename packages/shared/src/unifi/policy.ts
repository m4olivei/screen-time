/**
 * Pure helpers for the UniFi firewall policy read-modify-write cycle.
 *
 * The Integration API's read model ("Firewall policy") carries three fields
 * that the write model ("Create or update firewall policy") does not accept:
 * `id`, `index`, and `metadata`. A PUT body must be the GET response minus
 * those fields, with only `enabled` changed. Everything else — including
 * fields this client knows nothing about — passes through untouched so the
 * policy's targeting (Kids network etc.) is preserved verbatim.
 */

/**
 * A firewall policy as returned by the Integration API. Treated as opaque
 * apart from the fields the client and proof script need to read.
 */
export interface UnifiFirewallPolicy {
	id: string;
	name: string;
	enabled: boolean;
	[key: string]: unknown;
}

/**
 * The PUT body for "Update Firewall Policy": the read model minus read-only
 * fields. Opaque apart from `enabled`.
 */
export interface WritableFirewallPolicy {
	enabled: boolean;
	[key: string]: unknown;
}

/**
 * Fields present in the read model but absent from the
 * "Create or update firewall policy" write schema.
 */
export const READ_ONLY_POLICY_FIELDS = ['id', 'index', 'metadata'] as const;

/**
 * Build the PUT body from a GET response: strip the read-only fields, set
 * `enabled` to the requested value, and pass every other field through
 * untouched. Does not mutate the input.
 */
export function toWritableFirewallPolicy(
	policy: Record<string, unknown>,
	enabled: boolean
): WritableFirewallPolicy {
	const body: Record<string, unknown> = { ...policy };
	for (const field of READ_ONLY_POLICY_FIELDS) {
		delete body[field];
	}
	body.enabled = enabled;
	return body as WritableFirewallPolicy;
}
