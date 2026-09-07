import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { isDuplicateEntryError } from '../../shared/database/mysql-errors.js';
import { MYSQL_POOL } from '../../shared/database/mysql.pool.js';
import { LockerCodeTakenError } from '../domain/errors.js';
import { Locker } from '../domain/locker.entity.js';
import { LockerSize } from '../domain/locker-size.js';
import type {
  ListLockersFilter,
  LockerOccupancy,
  LockerRepository,
} from '../domain/locker.repository.js';

/**
 * Size ordering for SQL. Mirrors `LockerSize` rank (the source of truth) — only
 * the allocator query needs sizes ordered, so it lives inline rather than in a
 * reference table.
 */
const sizeRank = (expr: string) =>
  `FIELD(${expr}, 'SMALL', 'MEDIUM', 'LARGE')`;

@Injectable()
export class MysqlLockerRepository implements LockerRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async save(locker: Locker): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO locker
           (id, station_id, code, size_code, status, created_at, updated_at)
         VALUES
           (:id, :stationId, :code, :sizeCode, :status, :createdAt, :updatedAt)`,
        {
          id: locker.id,
          stationId: locker.stationId,
          code: locker.code,
          sizeCode: locker.size.code,
          status: locker.status,
          createdAt: locker.createdAt,
          updatedAt: locker.updatedAt,
        },
      );
    } catch (err) {
      if (isDuplicateEntryError(err)) {
        throw new LockerCodeTakenError(locker.stationId, locker.code);
      }
      throw err;
    }
  }

  async findById(id: string): Promise<Locker | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, station_id, code, size_code, status, created_at, updated_at
       FROM locker WHERE id = :id LIMIT 1`,
      { id },
    );
    return rows.length ? this.toLocker(rows[0]) : null;
  }

  async existsByStationAndCode(
    stationId: string,
    code: string,
  ): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT 1 FROM locker WHERE station_id = :stationId AND code = :code LIMIT 1`,
      { stationId, code },
    );
    return rows.length > 0;
  }

  async listWithOccupancy(
    filter: ListLockersFilter = {},
  ): Promise<LockerOccupancy[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id, l.station_id, l.code, l.size_code, l.status,
              l.created_at, l.updated_at,
              p.id AS active_package_id,
              st.name AS station_name, st.location AS station_location
       FROM locker l
       JOIN locker_station st ON st.id = l.station_id
       LEFT JOIN package p ON p.active_locker_id = l.id
       WHERE (:stationId IS NULL OR l.station_id = :stationId)
       ORDER BY ${sizeRank('l.size_code')} ASC, l.code ASC`,
      { stationId: filter.stationId ?? null },
    );
    return rows.map((row) => ({
      locker: this.toLocker(row),
      activePackageId: (row.active_package_id as string | null) ?? null,
      station: {
        id: row.station_id as string,
        name: row.station_name as string,
        location: (row.station_location as string | null) ?? null,
      },
    }));
  }

  async findAvailableSmallestFit(
    stationId: string,
    required: LockerSize,
  ): Promise<Locker | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id, l.station_id, l.code, l.size_code, l.status,
              l.created_at, l.updated_at
       FROM locker l
       LEFT JOIN package p ON p.active_locker_id = l.id
       WHERE l.station_id = :stationId
         AND l.status = 'IN_SERVICE'
         AND p.id IS NULL
         AND ${sizeRank('l.size_code')} >= ${sizeRank(':requiredCode')}
       ORDER BY ${sizeRank('l.size_code')} ASC, l.code ASC
       LIMIT 1`,
      { stationId, requiredCode: required.code },
    );
    return rows.length ? this.toLocker(rows[0]) : null;
  }

  private toLocker(row: RowDataPacket): Locker {
    return Locker.fromPersistence({
      id: row.id as string,
      stationId: row.station_id as string,
      code: row.code as string,
      size: LockerSize.of(row.size_code as string),
      status: row.status as Locker['status'],
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    });
  }
}
