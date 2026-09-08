import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import {
  isDuplicateEntryError,
  isMissingReferenceError,
} from '../../shared/database/mysql-errors.js';
import { MYSQL_POOL } from '../../shared/database/mysql.pool.js';
import { StationNotFoundError } from '../../stations/domain/errors.js';
import { LockerCodeTakenError } from '../domain/errors.js';
import { Locker } from '../domain/locker.entity.js';
import { LockerSize } from '../domain/locker-size.js';
import type { LockerSort, LockerSortField } from '../domain/locker-sort.js';
import type {
  ListLockersQuery,
  LockerOccupancy,
  LockerOccupancyPage,
  LockerRepository,
} from '../domain/locker.repository.js';

const OCCUPANCY_COLUMNS = `
  l.id, l.station_id, l.code, l.size_code, l.status,
  l.created_at, l.updated_at,
  la.package_id AS active_package_id,
  st.name AS station_name, st.location AS station_location`;

// `uq_one_active_assignment_per_locker` makes the LEFT JOIN 1:0..1, so this
// neither multiplies rows nor inflates COUNT(*).
const OCCUPANCY_FROM = `
  FROM locker l
  JOIN locker_station st ON st.id = l.station_id
  LEFT JOIN locker_assignment la ON la.active_locker_id = l.id`;

const LIST_WHERE = `
  WHERE (:stationId IS NULL OR l.station_id = :stationId)
    AND (:sizeCode IS NULL OR l.size_code = :sizeCode)
    AND (:status IS NULL OR l.status = :status)
    AND (:availability IS NULL
         OR (:availability = 'FREE' AND la.package_id IS NULL)
         OR (:availability = 'OCCUPIED' AND la.package_id IS NOT NULL))
    -- Retired lockers stay hidden unless the flag asks for them, or a status
    -- filter names one explicitly: a caller asking for DECOMMISSIONED would
    -- otherwise have them filtered straight back out and always get nothing.
    -- (No literal "question mark" in this SQL, comments included: mysql2 binds
    --  it as a positional placeholder and every named value after it shifts.)
    AND (:includeDecommissioned OR :status IS NOT NULL
         OR l.status <> 'DECOMMISSIONED')`;

/** Sortable field -> the expression it orders by. Keyed by a closed union, so
 *  nothing a client sends can reach the `ORDER BY` as text.
 *
 *  `code` and `createdAt` are answered by an index walk (see 004). `station`
 *  cannot be: `st.name` lives in the joined table, and ordering happens after
 *  joining, so no index on `locker` can spare the sort. It stays because it is
 *  high-cardinality and a real way to read a multi-station bank; the cost is
 *  bounded by the station filter in practice. */
const SORT_EXPRESSIONS: Record<LockerSortField, string> = {
  code: 'l.code',
  station: 'st.name',
  createdAt: 'l.created_at',
};

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
      // The service checks the station first; this covers the race and keeps a
      // bad `stationId` a 404 rather than a 500.
      if (isMissingReferenceError(err)) {
        throw new StationNotFoundError(locker.stationId);
      }
      throw err;
    }
  }

  async update(locker: Locker): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE locker
         SET code = :code, status = :status, updated_at = :updatedAt
         WHERE id = :id`,
        {
          id: locker.id,
          code: locker.code,
          status: locker.status,
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

  async findByIdWithOccupancy(id: string): Promise<LockerOccupancy | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ${OCCUPANCY_COLUMNS} ${OCCUPANCY_FROM} WHERE l.id = :id LIMIT 1`,
      { id },
    );
    return rows.length ? this.toOccupancy(rows[0]) : null;
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

  async listWithOccupancy({
    filter,
    sort,
    page,
  }: ListLockersQuery): Promise<LockerOccupancyPage> {
    const params = {
      stationId: filter.stationId ?? null,
      sizeCode: filter.size?.code ?? null,
      status: filter.status ?? null,
      availability: filter.availability ?? null,
      includeDecommissioned: filter.includeDecommissioned ?? false,
    };

    const [[counted], [rows]] = await Promise.all([
      this.pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total ${OCCUPANCY_FROM} ${LIST_WHERE}`,
        params,
      ),
      this.pool.query<RowDataPacket[]>(
        `SELECT ${OCCUPANCY_COLUMNS} ${OCCUPANCY_FROM} ${LIST_WHERE}
         ORDER BY ${orderBy(sort)}
         LIMIT :limit OFFSET :offset`,
        { ...params, limit: page.limit, offset: page.offset },
      ),
    ]);

    return {
      rows: rows.map((row) => this.toOccupancy(row)),
      total: Number(counted[0].total),
    };
  }

  private toOccupancy(row: RowDataPacket): LockerOccupancy {
    return {
      locker: this.toLocker(row),
      activePackageId: (row.active_package_id as string | null) ?? null,
      station: {
        id: row.station_id as string,
        name: row.station_name as string,
        location: (row.station_location as string | null) ?? null,
      },
    };
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

/**
 * The chosen column, then tiebreakers that make the order *total*. Without them
 * paging is unsound: `code` is unique per station only, so rows tying on the
 * sort column may come back in a different order per query and a row then
 * repeats on one page and vanishes from the next.
 */
function orderBy(sort: LockerSort): string {
  const direction = sort.direction === 'desc' ? 'DESC' : 'ASC';
  const columns = [`${SORT_EXPRESSIONS[sort.field]} ${direction}`];
  if (sort.field !== 'code') columns.push('l.code ASC');
  columns.push('l.id ASC');
  return columns.join(', ');
}
