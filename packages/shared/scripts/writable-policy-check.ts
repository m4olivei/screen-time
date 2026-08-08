/**
 * Assertion script for the pure PUT-body builder of the UniFi client.
 *
 * Run: pnpm --filter @screen-time/shared exec tsx scripts/writable-policy-check.ts
 *
 * Verifies that toWritableFirewallPolicy strips exactly the read-only fields
 * (`id`, `index`, `metadata` — present in the spec's "Firewall policy" read
 * model but absent from "Create or update firewall policy"), overrides only
 * `enabled`, and passes every other field through untouched and by value.
 */
import assert from 'node:assert/strict';
import { toWritableFirewallPolicy } from '../src/index.js';

const policy = {
	id: '6924ceb8a583ba509408791e',
	index: 10000,
	metadata: { origin: 'USER', linkedResourceType: null },
	enabled: true,
	name: 'Block Kids Internet',
	description: 'Managed by screen-time',
	action: 'BLOCK',
	source: { matchOpposite: false, zoneId: 'zone-a' },
	destination: { zoneId: 'zone-b' },
	ipProtocolScope: { scope: 'ALL' },
	connectionStateFilter: ['NEW', 'INVALID'],
	ipsecFilter: 'MATCH_NOT_ENCRYPTED',
	loggingEnabled: false,
	schedule: { mode: 'ALWAYS' }
};

const body = toWritableFirewallPolicy(policy, false);

// Read-only fields are stripped.
assert.equal('id' in body, false, 'id must be stripped');
assert.equal('index' in body, false, 'index must be stripped');
assert.equal('metadata' in body, false, 'metadata must be stripped');

// Only `enabled` is overridden.
assert.equal(body.enabled, false, 'enabled must be set to the requested value');

// Everything else passes through untouched (opaque pass-through).
const { id: _id, index: _index, metadata: _metadata, enabled: _enabled, ...rest } = policy;
assert.deepEqual(body, { ...rest, enabled: false });

// The input policy object is not mutated.
assert.equal(policy.enabled, true, 'input policy must not be mutated');
assert.equal(policy.id, '6924ceb8a583ba509408791e');

// Unknown extra fields (future controller versions) pass through too.
const withExtra = { ...policy, futureField: { nested: 1 } };
const bodyExtra = toWritableFirewallPolicy(withExtra, true);
assert.deepEqual(bodyExtra.futureField, { nested: 1 }, 'unknown fields must pass through');
assert.equal(bodyExtra.enabled, true);

console.log('OK: toWritableFirewallPolicy strips id/index/metadata and passes the rest through');
