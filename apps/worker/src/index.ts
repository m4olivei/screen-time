/**
 * apps/worker — the reconcile loop.
 *
 * Every tick (TICK_INTERVAL_MS, default 5000) the worker reads the shared
 * SQLite database, computes each profile's desired state via the shared
 * `computeDesiredState`, and reconciles the profile's UniFi firewall policy:
 * desired ON ⇒ policy disabled, desired OFF ⇒ policy enabled (the policy
 * BLOCKS traffic when enabled). It GETs the policy each tick and PUTs only
 * when the actual `enabled` flag differs from desired — no write on no-op
 * ticks, no edge-tracking state between ticks.
 *
 * Deliberately absent (per plan): cron/schedulers, health endpoints, metrics,
 * and any IPC/poke channel with the web app. A plain sleep loop is the whole
 * runtime; systemd (`screen-time-worker.service`) handles restarts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	computeDesiredState,
	createDataSource,
	createUnifiClient,
	getActiveOverrides,
	getAllProfiles,
	getScheduleWindows,
	pruneExpiredOverrides,
	type DesiredState,
	type UnifiClient
} from '@screen-time/shared';

/** The shared data source type, without depending on typeorm directly. */
type DataSource = Awaited<ReturnType<typeof createDataSource>>;

// --- Environment ------------------------------------------------------------

// Load .env from the package directory (apps/worker), resolved from this
// module's location so it works regardless of cwd. This file lives at
// src/index.ts (tsx) or dist/index.js (built) — the package dir is one up.
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
	process.loadEnvFile(path.join(packageDir, '.env'));
} catch {
	// No .env file — fine when the environment comes from elsewhere
	// (e.g. systemd's EnvironmentFile=). requireEnv below catches real gaps.
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (value === undefined || value === '') {
		throw new Error(`Missing required environment variable ${name} (see apps/worker/.env.example)`);
	}
	return value;
}

const config = {
	gatewayUrl: requireEnv('UNIFI_GATEWAY_URL'),
	apiKey: requireEnv('UNIFI_API_KEY'),
	siteId: requireEnv('UNIFI_SITE_ID'),
	dbPath: requireEnv('DB_PATH'),
	timeZone: requireEnv('TIMEZONE'),
	tickIntervalMs: Number(process.env.TICK_INTERVAL_MS ?? '') || 5000
};

// --- Helpers ----------------------------------------------------------------

function log(message: string): void {
	console.log(`${new Date().toISOString()} ${message}`);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map desired internet state to the policy's `enabled` flag. The UniFi
 * firewall policy blocks traffic when enabled, so ON ⇒ disabled and
 * OFF ⇒ enabled.
 */
function desiredPolicyEnabled(desired: DesiredState): boolean {
	return desired === 'OFF';
}

// --- Reconcile tick ---------------------------------------------------------

async function tick(dataSource: DataSource, unifi: UnifiClient): Promise<void> {
	const now = new Date();

	// Opportunistic cleanup — expired overrides never affect computeDesiredState,
	// pruning just keeps the table small.
	const pruned = await pruneExpiredOverrides(dataSource, now);
	if (pruned > 0) log(`pruned ${pruned} expired override(s)`);

	const profiles = await getAllProfiles(dataSource);
	for (const profile of profiles) {
		const windows = await getScheduleWindows(dataSource, profile.id);
		const overrides = await getActiveOverrides(dataSource, profile.id, now);
		const desired = computeDesiredState({ now, timeZone: config.timeZone, windows, overrides });
		const wantEnabled = desiredPolicyEnabled(desired);

		const policy = await unifi.getFirewallPolicy(config.siteId, profile.unifiRuleId);
		const action = policy.enabled === wantEnabled ? 'noop' : wantEnabled ? 'enable' : 'disable';
		log(
			`profile="${profile.name}" desired=${desired} policyEnabled=${policy.enabled} action=${action}`
		);
		if (action !== 'noop') {
			await unifi.setFirewallPolicyEnabled(config.siteId, profile.unifiRuleId, wantEnabled);
			log(`profile="${profile.name}" PUT policy "${policy.name}" enabled=${wantEnabled}`);
		}
	}
}

// --- Startup + loop ---------------------------------------------------------

async function main(): Promise<void> {
	log(`worker starting: tick=${config.tickIntervalMs}ms timeZone=${config.timeZone}`);

	const dataSource = await createDataSource(config.dbPath);
	const unifi = createUnifiClient({ gatewayUrl: config.gatewayUrl, apiKey: config.apiKey });

	// Log the name of each policy we control so a wrong configured ID is
	// immediately visible in the startup output.
	for (const profile of await getAllProfiles(dataSource)) {
		try {
			const policy = await unifi.getFirewallPolicy(config.siteId, profile.unifiRuleId);
			log(
				`profile="${profile.name}" controls policy "${policy.name}" ` +
					`(id=${profile.unifiRuleId}, enabled=${policy.enabled})`
			);
		} catch (error) {
			log(`profile="${profile.name}" policy lookup failed (id=${profile.unifiRuleId}): ${error}`);
		}
	}

	// The loop never exits on a tick error — a transient UniFi/DB failure is
	// logged and the next tick retries from absolute desired state.
	while (true) {
		try {
			await tick(dataSource, unifi);
		} catch (error) {
			log(`tick failed: ${error}`);
		}
		await sleep(config.tickIntervalMs);
	}
}

main().catch((error) => {
	// Startup (env/db) failures are fatal; systemd's Restart=always retries.
	console.error(error);
	process.exit(1);
});
