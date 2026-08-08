import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Override } from './entities/Override.js';
import { Profile } from './entities/Profile.js';
import { ScheduleWindow } from './entities/ScheduleWindow.js';

/**
 * Create and initialize the shared SQLite data source.
 *
 * Both the web app and the worker call this with the same file path (each
 * reads it from its own env) so SQLite stays the single source of truth.
 *
 * Schema management: `synchronize: true` is a deliberate greenfield choice —
 * TypeORM creates/updates the tables from the entity definitions on startup.
 * Revisit (switch to migrations) once the schema needs to evolve with data in
 * place.
 */
export async function createDataSource(dbPath: string): Promise<DataSource> {
	const dataSource = new DataSource({
		type: 'better-sqlite3',
		database: dbPath,
		entities: [Profile, ScheduleWindow, Override],
		synchronize: true
	});
	await dataSource.initialize();
	// WAL mode lets the web app and worker read/write concurrently without
	// blocking each other on this shared file.
	await dataSource.query('PRAGMA journal_mode=WAL;');
	return dataSource;
}
