import { createPool, type Pool } from 'mysql2/promise';
import type { DatabaseConfig } from '../config/configuration.js';

export const MYSQL_POOL = Symbol('MYSQL_POOL');

/**
 * The one connection pool for the app. `timezone: 'Z'` makes mysql2 write JS
 * `Date`s as UTC and read `DATETIME` back as UTC — the app always deals in UTC
 * and supplies every timestamp itself (via `Clock`).
 */
export function createMysqlPool(config: DatabaseConfig): Pool {
  return createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: false,
  });
}
