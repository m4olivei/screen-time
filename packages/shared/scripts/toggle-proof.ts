/**
 * Live proof of the UniFi firewall-policy toggle round-trip.
 *
 * Run: pnpm --filter @screen-time/shared exec tsx scripts/toggle-proof.ts
 *
 * Reads UNIFI_GATEWAY_URL, UNIFI_API_KEY, UNIFI_SITE_ID and UNIFI_POLICY_ID
 * from packages/shared/.env (or the process environment), then:
 * GETs the policy and prints its name + enabled state, flips `enabled` via
 * read-modify-write PUT, re-GETs to confirm the flip, restores the original
 * value, and re-GETs to confirm restoration. Exits 0 on success.
 *
 * The restore step runs even if the confirm step throws (try/finally), so the
 * policy is always left as it was found. The API key is never printed.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUnifiClient, UnifiApiError } from '../src/index.js';

// Load packages/shared/.env regardless of cwd; real env vars take precedence.
const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envPath)) {
	process.loadEnvFile(envPath);
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		console.error(`Missing required environment variable ${name} (set it in packages/shared/.env)`);
		process.exit(1);
	}
	return value;
}

const gatewayUrl = requireEnv('UNIFI_GATEWAY_URL');
const apiKey = requireEnv('UNIFI_API_KEY');
const siteId = requireEnv('UNIFI_SITE_ID');
const policyId = requireEnv('UNIFI_POLICY_ID');

const client = createUnifiClient({ gatewayUrl, apiKey });

console.log(`Gateway: ${gatewayUrl}`);
console.log(`Site:    ${siteId}`);
console.log(`Policy:  ${policyId}`);
console.log("Semantics: policy enabled: true => kids' internet OFF (block policy active)");
console.log('');

try {
	const before = await client.getFirewallPolicy(siteId, policyId);
	const original = before.enabled;
	console.log(`[1/5] GET   policy "${before.name}" — enabled: ${original}`);

	const flipped = !original;
	try {
		const afterFlip = await client.setFirewallPolicyEnabled(siteId, policyId, flipped);
		console.log(`[2/5] PUT   flipped enabled -> ${afterFlip.enabled} (expected ${flipped})`);

		const confirmFlip = await client.getFirewallPolicy(siteId, policyId);
		console.log(`[3/5] GET   confirm flip — enabled: ${confirmFlip.enabled}`);
		assert.equal(confirmFlip.enabled, flipped, 'flip was not persisted');
	} finally {
		// Always restore the original value, even if the confirm step threw.
		const restored = await client.setFirewallPolicyEnabled(siteId, policyId, original);
		console.log(`[4/5] PUT   restored enabled -> ${restored.enabled} (expected ${original})`);
	}

	const confirmRestore = await client.getFirewallPolicy(siteId, policyId);
	console.log(`[5/5] GET   confirm restore — enabled: ${confirmRestore.enabled}`);
	assert.equal(confirmRestore.enabled, original, 'restore was not persisted');

	console.log('');
	console.log(
		`SUCCESS: toggle round-trip proven; policy "${before.name}" left at enabled: ${original}`
	);
} catch (error) {
	if (error instanceof UnifiApiError) {
		console.error(`FAILED: ${error.message}`);
		console.error(`Response body: ${error.body}`);
	} else {
		console.error('FAILED:', error);
	}
	process.exit(1);
}
