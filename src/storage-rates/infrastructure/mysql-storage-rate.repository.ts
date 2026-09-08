import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import { isDuplicateEntryError } from '../../shared/database/mysql-errors.js';
import { MYSQL_POOL } from '../../shared/database/mysql.pool.js';
import { withTransaction } from '../../shared/database/transaction.js';
import {
  StorageRateConfigError,
  StorageRateVersionExistsError,
} from '../domain/errors.js';
import { StorageRateBand } from '../domain/storage-rate.js';
import {
  StorageRateSchedule,
  type StorageRateBandEntry,
} from '../domain/storage-rate-schedule.js';
import type {
  ListStorageRateVersionsFilter,
  StorageRateCatalog,
} from '../domain/storage-rate.catalog.js';
import type { StorageRateRepository } from '../domain/storage-rate.repository.js';

/**
 * One adapter, two roles: the narrow read the fee path needs and the operator
 * catalog. They are separate ports so the retrieval path cannot reach a write.
 */
@Injectable()
export class MysqlStorageRateRepository
  implements StorageRateRepository, StorageRateCatalog
{
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

    return rows.map((row) => this.toBand(row));
  }

  async publish(schedule: StorageRateSchedule): Promise<void> {
    try {
      await withTransaction(this.pool, async (conn) => {
        for (const { id, band } of schedule.entries) {
          await conn.query(
            `INSERT INTO storage_rate
               (id, size_code, from_day, to_day, rate_minor, effective_from,
                created_at, updated_at)
             VALUES (:id, :sizeCode, :fromDay, :toDay, :rateMinor, :effectiveFrom,
                     :createdAt, :updatedAt)`,
            {
              id,
              sizeCode: schedule.size.code,
              fromDay: band.fromDay,
              toDay: band.toDay,
              rateMinor: band.rateMinor,
              effectiveFrom: schedule.effectiveFrom,
              createdAt: schedule.createdAt,
              updatedAt: schedule.updatedAt,
            },
          );
        }
      });
    } catch (err) {
      // uq_storage_rate_band: this size already has a version at that instant.
      // The service checks first, but only the key holds under a concurrent
      // publish.
      if (isDuplicateEntryError(err)) {
        throw new StorageRateVersionExistsError(
          schedule.size.code,
          schedule.effectiveFrom,
        );
      }
      throw err;
    }
  }

  async listVersions(
    filter: ListStorageRateVersionsFilter = {},
  ): Promise<StorageRateSchedule[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, size_code, from_day, to_day, rate_minor, effective_from,
              created_at, updated_at
       FROM storage_rate
       WHERE (:size IS NULL OR size_code = :size)
       ORDER BY effective_from DESC, size_code ASC, from_day ASC`,
      { size: filter.size?.code ?? null },
    );

    // Rows arrive grouped by the ordering above, and a Map keeps insertion
    // order, so the versions come out newest-first without a second sort.
    const versions = new Map<string, RowDataPacket[]>();
    for (const row of rows) {
      const key = `${row.size_code}|${(row.effective_from as Date).getTime()}`;
      const group = versions.get(key) ?? [];
      group.push(row);
      versions.set(key, group);
    }

    return [...versions.values()].map((group) => this.toSchedule(group));
  }

  private toSchedule(rows: RowDataPacket[]): StorageRateSchedule {
    const entries: StorageRateBandEntry[] = rows.map((row) => ({
      id: row.id as string,
      band: this.toBand(row),
    }));
    // Every row of a version is written in one transaction, so they carry the
    // same timestamps — the first row speaks for the version.
    return StorageRateSchedule.fromPersistence({
      size: LockerSize.of(rows[0].size_code as string),
      effectiveFrom: rows[0].effective_from as Date,
      entries,
      createdAt: rows[0].created_at as Date,
      updatedAt: rows[0].updated_at as Date,
    });
  }

  /**
   * A persisted row that won't rebuild is a misconfigured rate table, not a
   * caller's mistake — the CHECK constraints and the publish path both rule it
   * out — so it surfaces as a 500 rather than the band's own validation error.
   */
  private toBand(row: RowDataPacket): StorageRateBand {
    try {
      return StorageRateBand.of({
        fromDay: Number(row.from_day),
        toDay: row.to_day === null ? null : Number(row.to_day),
        rateMinor: Number(row.rate_minor),
      });
    } catch (err) {
      throw new StorageRateConfigError(
        `storage_rate row ${row.id ?? '(unidentified)'} is invalid: ${(err as Error).message}`,
      );
    }
  }
}
