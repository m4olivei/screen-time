/**
 * Smoke test for the shared SQLite data layer.
 *
 * Run: pnpm --filter @screen-time/shared exec tsx scripts/db-smoke.ts [dbPath]
 *
 * Creates the schema in a temp SQLite file (or the path given as the first
 * argument), inserts a Profile + ScheduleWindow + Override, reads them back
 * via the shared query helpers, and prints everything. Prints the DB path so
 * the tables can be inspected afterwards with `sqlite3 <path> ".tables"`.
 */
import 'reflect-metadata';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	createDataSource,
	createOverride,
	createScheduleWindow,
	getActiveOverrides,
	getAllProfiles,
	getScheduleWindows,
	Profile
} from '../src/index.js';

const dbPath = process.argv[2] ?? join(mkdtempSync(join(tmpdir(), 'screen-time-')), 'smoke.sqlite');

const dataSource = await createDataSource(dbPath);

const profile = await dataSource
	.getRepository(Profile)
	.save(dataSource.getRepository(Profile).create({ name: 'Kid A', unifiRuleId: 'rule-123' }));

const window = await createScheduleWindow(dataSource, {
	profileId: profile.id,
	dayOfWeek: 1, // Monday
	startMinute: 16 * 60, // 16:00
	endMinute: 19 * 60 // 19:00
});

const override = await createOverride(dataSource, {
	profileId: profile.id,
	type: 'extend',
	effectiveUntil: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
});

const profiles = await getAllProfiles(dataSource);
const windows = await getScheduleWindows(dataSource, profile.id);
const activeOverrides = await getActiveOverrides(dataSource, profile.id);

console.log('DB path:', dbPath);
console.log('Inserted profile:', profile);
console.log('Inserted schedule window:', window);
console.log('Inserted override:', override);
console.log('Read back — profiles:', profiles);
console.log('Read back — schedule windows:', windows);
console.log('Read back — active overrides:', activeOverrides);

await dataSource.destroy();
console.log('OK');
