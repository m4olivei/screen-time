import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Kinds of temporary override:
 * - `extend`: keep the internet ON past the scheduled window end.
 * - `allow_now`: turn the internet ON outside any scheduled window.
 * - `block_now`: turn the internet OFF even inside a scheduled window.
 */
export type OverrideType = 'extend' | 'allow_now' | 'block_now';

/**
 * A temporary override of a profile's schedule. An override is "active"
 * while `effectiveUntil` is in the future (see `activeOverrideWhere` in the
 * query helpers — the single shared definition of active).
 */
@Entity()
export class Override {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column('integer')
	profileId!: number;

	@Column('text')
	type!: OverrideType;

	/** Moment the override stops applying. Active while this is in the future. */
	@Column('datetime')
	effectiveUntil!: Date;

	@CreateDateColumn()
	createdAt!: Date;
}
