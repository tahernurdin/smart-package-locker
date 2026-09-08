import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { createMysqlPool } from '../src/shared/database/mysql.pool.js';

/**
 * MySQL can't express "no overlapping / gapping rate bands" as a constraint
 * (Postgres used `EXCLUDE USING gist`), so this guards the stored data instead.
 * `StorageRateSchedule` enforces the same rule on everything an operator
 * publishes; this is the check on what is actually in the table, seed included.
 */
describe('storage_rate versions (e2e)', () => {
  let pool: Pool;

  beforeAll(async () => {
    const config = loadConfiguration();
    await runMigrations(config.database, { log: () => undefined });
    pool = createMysqlPool(config.database);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('has gapless bands from day 0 with an open-ended tail in every version', async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT size_code, effective_from, from_day, to_day
       FROM storage_rate
       ORDER BY size_code, effective_from, from_day`,
    );

    // A version is one size at one instant, not a whole size: once a second
    // version is published, grouping by size_code alone interleaves the two.
    const versions = new Map<string, RowDataPacket[]>();
    for (const row of rows) {
      const key = `${row.size_code}@${(row.effective_from as Date).toISOString()}`;
      const bands = versions.get(key) ?? [];
      bands.push(row);
      versions.set(key, bands);
    }

    const sizes = new Set([...rows].map((row) => row.size_code as string));
    expect([...sizes].sort()).toEqual(['LARGE', 'MEDIUM', 'SMALL']);

    for (const [version, bands] of versions) {
      expect(bands[0].from_day, `${version} starts at day 0`).toBe(0);
      for (let i = 0; i < bands.length - 1; i++) {
        expect(
          bands[i].to_day,
          `${version} band ${i} → ${i + 1} is contiguous`,
        ).toBe(bands[i + 1].from_day);
      }
      expect(
        bands[bands.length - 1].to_day,
        `${version} ends open-ended`,
      ).toBeNull();
    }
  });
});
