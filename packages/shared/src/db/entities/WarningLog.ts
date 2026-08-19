import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * One row per pre-cutoff warning threshold the worker has already **handled**
 * for a given cutoff. "Handled" is not the same as "delivered": a threshold
 * suppressed for staleness (the worker was asleep, the tick came too late) is
 * recorded here too, because the point of the table is that a threshold is
 * never revisited. This is not a delivery log.
 *
 * The identity of a warning ladder is `(profileId, cutoffAt)`. `cutoffAt` is
 * part of that identity on purpose: an override that moves the cutoff produces
 * a different `cutoffAt`, so every threshold re-arms for the new cutoff while
 * the rows for the old one simply age out.
 *
 * Rows survive a worker restart — that is the whole reason they are persisted
 * rather than held in memory. `pruneWarningLog` clears rows whose cutoff has
 * passed, since such a ladder can never fire again.
 */
@Entity()
@Unique(['profileId', 'cutoffAt', 'thresholdMinutes'])
export class WarningLog {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column('integer')
	profileId!: number;

	/** The cutoff this warning counts down to. Part of the ladder's identity. */
	@Column('datetime')
	cutoffAt!: Date;

	/** Minutes before `cutoffAt` that this rung of the ladder represents. */
	@Column('integer')
	thresholdMinutes!: number;

	@CreateDateColumn()
	handledAt!: Date;
}
