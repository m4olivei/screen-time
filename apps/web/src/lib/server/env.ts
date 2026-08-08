/**
 * Server-only environment configuration for the web app.
 *
 * Reads `apps/web/.env` (spec'd by the committed `.env.example`) via Node's
 * built-in `process.loadEnvFile`, resolved relative to this module so it works
 * regardless of the process working directory. Variables already present in
 * the real environment take precedence over the file.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) {
	process.loadEnvFile(envFile);
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
