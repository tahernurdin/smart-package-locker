import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { LockerSize } from '../../lockers/domain/locker-size.js';
import { MYSQL_POOL } from '../../shared/database/mysql.pool.js';
import { StorageRateBand } from '../domain/storage-rate.js';
import type { StorageRateRepository } from '../domain/storage-rate.repository.js';

@Injectable()
export class MysqlStorageRateRepository implements StorageRateRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async findBandsFor(size: LockerSize, asOf: Date): Promise<StorageRateBand[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT from_day, to_day, rate_minor
       FROM storage_rate
       WHERE size_code = :size
         AND effective_from = (
           SELECT MAX(effective_from) FROM storage_rate
           WHERE size_code = :size AND effective_from <= :asOf
         )
       ORDER BY from_day`,
      { size: size.code, asOf },
    );

    return rows.map((row) =>
      StorageRateBand.of({
        fromDay: Number(row.from_day),
        toDay: row.to_day === null ? null : Number(row.to_day),
        rateMinor: Number(row.rate_minor),
      }),
    );
  }
}
