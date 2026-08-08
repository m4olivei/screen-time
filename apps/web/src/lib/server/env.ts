/**
 * Server-only environment configuration for the web app.
 *
 * Reads `apps/web/.env` (spec'd by the committed `.env.example`) via Node's
 * built-in `process.loadEnvFile`, resolved relative to this module so it works
 * regardless of the process working directory. Variables already present in
 * the real environment take precedence over the file.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Walk up from this module to the nearest `.env`. The module's on-disk
// location differs between dev (src/lib/server/) and the bundled build
// (.svelte-kit/output/server/chunks/), but both live under apps/web, so the
// nearest `.env` above either location is the package's env file.
let dir = dirname(fileURLToPath(import.meta.url));
while (true) {
	const candidate = join(dir, '.env');
	if (existsSync(candidate)) {
		process.loadEnvFile(candidate);
		break;
	}
	const parent = dirname(dir);
	if (parent === dir) break;
	dir = parent;
}

function required(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing required environment variable ${name} (see apps/web/.env.example)`);
	}
	return value;
}

/** Absolute path to the shared SQLite database file. */
export const DB_PATH = required('DB_PATH');

/** Household IANA timezone for schedule evaluation and time formatting. */
export const TIMEZONE = required('TIMEZONE');
