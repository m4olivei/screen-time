/**
 * @screen-time/shared — shared data layer, UniFi client, and desired-state logic.
 *
 * The TypeORM/SQLite data layer lives in `./db`, the UniFi Integration API
 * client in `./unifi`, and the pure schedule/override decision function in
 * `./desired-state`.
 */
import 'reflect-metadata';

export const SHARED_PACKAGE_NAME = '@screen-time/shared';

export * from './db/index.js';
export * from './unifi/index.js';
export {
	computeDesiredState,
	type ComputeDesiredStateInput,
	type DesiredState
} from './desired-state.js';
export {
	computeExtendAnchor,
	computeNextTransition,
	NEXT_TRANSITION_HORIZON_DAYS
} from './next-transition.js';
