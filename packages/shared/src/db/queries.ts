import { DataSource, LessThanOrEqual, MoreThan } from 'typeorm';
import { Override, OverrideType } from './entities/Override.js';
import { Profile } from './entities/Profile.js';
import { ScheduleWindow } from './entities/ScheduleWindow.js';

/**
 * The single shared definition of an "active" override: one whose
 * `effectiveUntil` is strictly in the future. Web and worker must both use
 * this (via `getActiveOverrides`) rather than re-deriving the comparison.
 */
export function activeOverrideWhere(now: Date = new Date()) {
	return { effectiveUntil: MoreThan(now) };
}

// --- Profiles ---

export function getAllProfiles(dataSource: DataSource): Promise<Profile[]> {
	return dataSource.getRepository(Profile).find();
}

// --- Schedule windows ---

export function getScheduleWindows(
	dataSource: DataSource,
	profileId: number
): Promise<ScheduleWindow[]> {
	return dataSource.getRepository(ScheduleWindow).find({
		where: { profileId },
		order: { dayOfWeek: 'ASC', startMinute: 'ASC' }
	});
}

export function createScheduleWindow(
	dataSource: DataSource,
	input: Pick<ScheduleWindow, 'profileId' | 'dayOfWeek' | 'startMinute' | 'endMinute'>
): Promise<ScheduleWindow> {
	const repository = dataSource.getRepository(ScheduleWindow);
	return repository.save(repository.create(input));
}

export async function updateScheduleWindow(
	dataSource: DataSource,
	id: number,
	changes: Partial<Pick<ScheduleWindow, 'dayOfWeek' | 'startMinute' | 'endMinute'>>
): Promise<ScheduleWindow | null> {
	const repository = dataSource.getRepository(ScheduleWindow);
	const window = await repository.findOneBy({ id });
	if (!window) return null;
	return repository.save(repository.merge(window, changes));
}

export async function deleteScheduleWindow(dataSource: DataSource, id: number): Promise<boolean> {
	const result = await dataSource.getRepository(ScheduleWindow).delete({ id });
	return (result.affected ?? 0) > 0;
}

// --- Overrides ---

/** Overrides for a profile that are still in effect (`effectiveUntil` > now). */
export function getActiveOverrides(
	dataSource: DataSource,
	profileId: number,
	now: Date = new Date()
): Promise<Override[]> {
	return dataSource.getRepository(Override).find({
		where: { profileId, ...activeOverrideWhere(now) },
		order: { effectiveUntil: 'DESC' }
	});
}

export function createOverride(
	dataSource: DataSource,
	input: { profileId: number; type: OverrideType; effectiveUntil: Date }
): Promise<Override> {
	const repository = dataSource.getRepository(Override);
	return repository.save(repository.create(input));
}

/** Push an existing override's `effectiveUntil` out to a new moment. */
export async function extendOverride(
	dataSource: DataSource,
	id: number,
	effectiveUntil: Date
): Promise<Override | null> {
	const repository = dataSource.getRepository(Override);
	const override = await repository.findOneBy({ id });
	if (!override) return null;
	override.effectiveUntil = effectiveUntil;
	return repository.save(override);
}

/** Delete overrides that are no longer active. Returns the number removed. */
export async function pruneExpiredOverrides(
	dataSource: DataSource,
	now: Date = new Date()
): Promise<number> {
	const result = await dataSource
		.getRepository(Override)
		.delete({ effectiveUntil: LessThanOrEqual(now) });
	return result.affected ?? 0;
}
