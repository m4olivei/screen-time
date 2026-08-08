/**
 * UniFi Network Integration API client.
 *
 * Talks to a UniFi gateway (UDM Pro) at `https://<gateway>/proxy/network/integration`
 * with `X-API-KEY` header auth on every request. The gateway serves a
 * self-signed certificate on the LAN, so requests go through a dedicated
 * undici Agent with `rejectUnauthorized: false` that is passed per-request
 * and confined to this module — the TLS exception is never applied
 * process-wide.
 *
 * The client knows two operations and treats the firewall policy body as
 * opaque apart from `enabled`. No retry logic: errors surface to the caller
 * (the worker's tick loop is the retry mechanism).
 */
import { Agent, fetch } from 'undici';
import {
	toWritableFirewallPolicy,
	type UnifiFirewallPolicy,
	type WritableFirewallPolicy
} from './policy.js';

export interface UnifiClientConfig {
	/** Base gateway URL, e.g. `https://192.168.1.1` (no trailing slash needed). */
	gatewayUrl: string;
	/** API key from the UniFi console (sent as `X-API-KEY`). */
	apiKey: string;
}

/** Error thrown when the gateway returns a non-2xx response. */
export class UnifiApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		/** Raw response body — the API's error envelope includes field-level detail. */
		public readonly body: string
	) {
		super(message);
		this.name = 'UnifiApiError';
	}
}

export interface UnifiClient {
	/** GET a firewall policy by ID. */
	getFirewallPolicy(siteId: string, policyId: string): Promise<UnifiFirewallPolicy>;
	/**
	 * Set a firewall policy's `enabled` flag via read-modify-write:
	 * GET the policy, change only `enabled`, strip read-only fields
	 * (`id`, `index`, `metadata`), and PUT the full object back.
	 * Returns the policy as the gateway returned it after the update.
	 */
	setFirewallPolicyEnabled(
		siteId: string,
		policyId: string,
		enabled: boolean
	): Promise<UnifiFirewallPolicy>;
}

export function createUnifiClient(config: UnifiClientConfig): UnifiClient {
	const baseUrl = `${config.gatewayUrl.replace(/\/+$/, '')}/proxy/network/integration`;

	// Self-signed cert trust exception, scoped to this Agent only.
	const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });

	async function request(method: 'GET' | 'PUT', path: string, body?: unknown): Promise<unknown> {
		const response = await fetch(`${baseUrl}${path}`, {
			method,
			dispatcher,
			headers: {
				'X-API-KEY': config.apiKey,
				Accept: 'application/json',
				...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {})
		});
		const text = await response.text();
		if (!response.ok) {
			throw new UnifiApiError(
				`UniFi API ${method} ${path} failed: ${response.status} ${response.statusText}`,
				response.status,
				text
			);
		}
		return text.length > 0 ? JSON.parse(text) : undefined;
	}

	async function getFirewallPolicy(siteId: string, policyId: string): Promise<UnifiFirewallPolicy> {
		const policy = await request('GET', `/v1/sites/${siteId}/firewall/policies/${policyId}`);
		return policy as UnifiFirewallPolicy;
	}

	async function setFirewallPolicyEnabled(
		siteId: string,
		policyId: string,
		enabled: boolean
	): Promise<UnifiFirewallPolicy> {
		const current = await getFirewallPolicy(siteId, policyId);
		const body: WritableFirewallPolicy = toWritableFirewallPolicy(current, enabled);
		const updated = await request('PUT', `/v1/sites/${siteId}/firewall/policies/${policyId}`, body);
		return updated as UnifiFirewallPolicy;
	}

	return { getFirewallPolicy, setFirewallPolicyEnabled };
}
