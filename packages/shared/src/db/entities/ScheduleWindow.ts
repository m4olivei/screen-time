import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A recurring weekly window during which a profile's internet is ALLOWED.
 * Times are minutes from local midnight (0–1439).
 */
@Entity()
export class ScheduleWindow {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column('integer')
	profileId!: number;

	/** Day of week: 0 = Sunday … 6 = Saturday. */
	@Column('integer')
	dayOfWeek!: number;

	/** Window start, minutes from local midnight (inclusive). */
	@Column('integer')
	startMinute!: number;

	/** Window end, minutes from local midnight (exclusive). */
	@Column('integer')
	endMinute!: number;
}
