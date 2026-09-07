import type { Pool, RowDataPacket } from 'mysql2/promise';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { createMysqlPool } from '../src/shared/database/mysql.pool.js';

/**
 * MySQL can't express "no overlapping / gapping rate bands" as a constraint
 * (Postgres used `EXCLUDE USING gist`), so this guards the seed instead.
 */
describe('storage_rate seed (e2e)', () => {
  let pool: Pool;

  beforeAll(async () => {
    const config = loadConfiguration();
    await runMigrations(config.database, { log: () => undefined });
    pool = createMysqlPool(config.database);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('has gapless bands from day 0 with an open-ended tail for every size', async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT size_code, from_day, to_day FROM storage_rate ORDER BY size_code, from_day`,
    );

    const bySize = new Map<string, RowDataPacket[]>();
    for (const row of rows) {
      const list = bySize.get(row.size_code) ?? [];
      list.push(row);
      bySize.set(row.size_code, list);
    }

    expect([...bySize.keys()].sort()).toEqual(['LARGE', 'MEDIUM', 'SMALL']);

    for (const [size, bands] of bySize) {
      expect(bands[0].from_day, `${size} starts at day 0`).toBe(0);
      for (let i = 0; i < bands.length - 1; i++) {
        expect(
          bands[i].to_day,
          `${size} band ${i} → ${i + 1} is contiguous`,
        ).toBe(bands[i + 1].from_day);
      }
      expect(
        bands[bands.length - 1].to_day,
        `${size} ends open-ended`,
      ).toBeNull();
    }
  });
});
