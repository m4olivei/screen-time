/**
 * @screen-time/shared — shared data layer and UniFi client.
 *
 * The TypeORM/SQLite data layer lives in `./db`, the UniFi Integration API
 * client in `./unifi`. The desired-state function arrives in a later task.
 */
import 'reflect-metadata';

export const SHARED_PACKAGE_NAME = '@screen-time/shared';

export * from './db/index.js';
export * from './unifi/index.js';
