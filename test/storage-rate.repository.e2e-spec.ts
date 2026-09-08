import type { Pool } from 'mysql2/promise';
import { LockerSize } from '../src/lockers/domain/locker-size.js';
import { MysqlStorageRateRepository } from '../src/storage-rates/infrastructure/mysql-storage-rate.repository.js';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { createMysqlPool } from '../src/shared/database/mysql.pool.js';

describe('MysqlStorageRateRepository (e2e)', () => {
  let pool: Pool;
  let repo: MysqlStorageRateRepository;

  beforeAll(async () => {
    const config = loadConfiguration();
    await runMigrations(config.database, { log: () => undefined });
    pool = createMysqlPool(config.database);
    repo = new MysqlStorageRateRepository(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('returns the seeded SMALL bands in fromDay order', async () => {
    const bands = await repo.findBandsFor(LockerSize.of('SMALL'), new Date());
    expect(bands.map((b) => [b.fromDay, b.toDay, b.rateMinor])).toEqual([
      [0, 1, 0],
      [1, 3, 600],
      [3, 6, 800],
      [6, null, 1000],
    ]);
  });

  it('returns [] when no rate version is effective yet', async () => {
    const bands = await repo.findBandsFor(
      LockerSize.of('SMALL'),
      new Date('2000-01-01T00:00:00Z'),
    );
    expect(bands).toEqual([]);
  });
});
