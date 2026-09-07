import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createConnection, type RowDataPacket } from 'mysql2/promise';
import type { DatabaseConfig } from '../config/configuration.js';

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

export interface MigrationLogger {
  log(message: string): void;
}

/**
 * Forward-only migration runner. Applies every `migrations/*.sql` file (sorted by
 * name) that isn't already recorded in `schema_migrations`. Idempotent: re-running
 * with nothing pending is a no-op.
 *
 * Note: MySQL auto-commits DDL, so a mid-file failure can't be fully rolled back —
 * keep each migration file self-contained and its statements `IF NOT EXISTS`.
 */
export async function runMigrations(
  config: DatabaseConfig,
  logger: MigrationLogger = console,
): Promise<string[]> {
  const conn = await createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    multipleStatements: true,
  });

  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name       VARCHAR(255) NOT NULL PRIMARY KEY,
         applied_at DATETIME(6)  NOT NULL
       )`,
    );

    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT name FROM schema_migrations',
    );
    const applied = new Set(rows.map((r) => r.name as string));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const ran: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      logger.log(`Applying migration ${file}`);
      try {
        await conn.query(sql);
        await conn.query(
          'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
          [file, new Date()],
        );
        ran.push(file);
      } catch (err) {
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`, {
          cause: err,
        });
      }
    }

    logger.log(
      ran.length ? `Applied ${ran.length} migration(s)` : 'No pending migrations',
    );
    return ran;
  } finally {
    await conn.end();
  }
}
