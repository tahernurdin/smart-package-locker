/**
 * Creates the e2e database once per run, so a fresh checkout can go straight
 * from `docker compose up -d mysql` to `npm run test:e2e` — the compose service
 * only creates `locker`, and `.env.test` points the suites at `locker_test`.
 *
 * Creating a database is a test-harness concern and deliberately stays out of
 * the migrator: `npm run db:migrate` must fail loudly against a database that
 * does not exist rather than conjure an empty one.
 */

import { createConnection } from 'mysql2/promise';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { loadTestEnv } from './env.js';

/** MySQL cannot parameterise an identifier, so the name is checked, not quoted. */
const SAFE_DATABASE_NAME = /^[A-Za-z0-9_]+$/;

export default async function setup(): Promise<void> {
  loadTestEnv();

  const { host, port, user, password, database } = loadConfiguration().database;
  if (!SAFE_DATABASE_NAME.test(database)) {
    throw new Error(
      `Refusing to create database ${JSON.stringify(database)}: ` +
        'the e2e database name must be alphanumeric or underscores.',
    );
  }

  const conn = await createConnection({ host, port, user, password });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
  } finally {
    await conn.end();
  }
}
