import { createDataSource } from '@screen-time/shared';
import { DB_PATH } from './env.js';

type DataSource = Awaited<ReturnType<typeof createDataSource>>;

let dataSourcePromise: Promise<DataSource> | null = null;

/**
 * Lazily initialized singleton data source for the whole web app. The first
 * caller triggers initialization; everyone shares the same connection to the
 * SQLite file at DB_PATH (WAL mode, so the worker can read/write concurrently).
 */
export function getDataSource(): Promise<DataSource> {
	dataSourcePromise ??= createDataSource(DB_PATH);
	return dataSourcePromise;
}
