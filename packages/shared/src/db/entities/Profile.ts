import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A household member whose internet access is managed.
 *
 * Semantics reminder for consumers: the UniFi firewall policy referenced by
 * `unifiRuleId` blocks traffic when it is ENABLED — policy enabled means the
 * internet is OFF for this profile, policy disabled means the internet is ON.
 */
@Entity()
export class Profile {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column('text')
	name!: string;

	/**
	 * ID of the UniFi firewall policy that blocks this profile's devices.
	 * The policy is created manually in the UniFi console; we only store its
	 * ID here and toggle its enabled state (enabled = internet OFF).
	 */
	@Column('text')
	unifiRuleId!: string;
}
