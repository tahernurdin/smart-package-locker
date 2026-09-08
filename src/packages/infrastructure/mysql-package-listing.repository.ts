import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import { MYSQL_POOL } from '../../shared/database/mysql.pool.js';
import { sizeOrderExpr } from '../../shared/database/size-order.js';
import type {
  ListPackagesQuery,
  PackageListingPage,
  PackageListingRepository,
  PackageListingRow,
} from '../domain/package-listing.repository.js';
import type { PackageSort, PackageSortField } from '../domain/package-sort.js';
import type { PackageStatus } from '../domain/package-status.js';

// No `pickup_code_hash` — see `PackageListingRow`. The listing is the read
// model that cannot leak the secret because it never loads it.
const LISTING_COLUMNS = `
  p.id, p.customer_id, p.size_code, p.tracking_ref, p.status, p.created_at,
  la.stored_at, la.retrieved_at, la.storage_fee_minor,
  l.id AS locker_id, l.code AS locker_code,
  st.id AS station_id, st.name AS station_name`;

// `uq_one_assignment_per_package` makes the assignment join 1:0..1, so this
// neither multiplies rows nor inflates COUNT(*). A REGISTERED parcel has no
// assignment yet, hence LEFT all the way down to the station.
const LISTING_FROM = `
  FROM package p
  LEFT JOIN locker_assignment la ON la.package_id = p.id
  LEFT JOIN locker l ON l.id = la.locker_id
  LEFT JOIN locker_station st ON st.id = l.station_id`;

// No literal question mark in this SQL, comments included: mysql2 binds it as a
// positional placeholder and every named value after it shifts.
const LISTING_WHERE = `
  WHERE (:customerId IS NULL OR p.customer_id = :customerId)
    AND (:status IS NULL OR p.status = :status)
    AND (:sizeCode IS NULL OR p.size_code = :sizeCode)
    AND (:stationId IS NULL OR l.station_id = :stationId)
    AND (:lockerId IS NULL OR la.locker_id = :lockerId)
    AND (:trackingRef IS NULL OR p.tracking_ref = :trackingRef)`;

/** Sortable field -> the expression it orders by. Keyed by a closed union, so
 *  nothing a client sends can reach the `ORDER BY` as text. */
const SORT_EXPRESSIONS: Record<PackageSortField, string> = {
  registeredAt: 'p.created_at',
  storedAt: 'la.stored_at',
  retrievedAt: 'la.retrieved_at',
  status: 'p.status',
  size: sizeOrderExpr('p.size_code'),
  station: 'st.name',
};

@Injectable()
export class MysqlPackageListingRepository implements PackageListingRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async list({
    filter,
    sort,
    page,
  }: ListPackagesQuery): Promise<PackageListingPage> {
    const params = {
      customerId: filter.customerId ?? null,
      status: filter.status ?? null,
      sizeCode: filter.size?.code ?? null,
      stationId: filter.stationId ?? null,
      lockerId: filter.lockerId ?? null,
      trackingRef: filter.trackingRef ?? null,
    };

    const [[counted], [rows]] = await Promise.all([
      this.pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total ${LISTING_FROM} ${LISTING_WHERE}`,
        params,
      ),
      this.pool.query<RowDataPacket[]>(
        `SELECT ${LISTING_COLUMNS} ${LISTING_FROM} ${LISTING_WHERE}
         ORDER BY ${orderBy(sort)}
         LIMIT :limit OFFSET :offset`,
        { ...params, limit: page.limit, offset: page.offset },
      ),
    ]);

    return {
      rows: rows.map((row) => this.toRow(row)),
      total: Number(counted[0].total),
    };
  }

  private toRow(row: RowDataPacket): PackageListingRow {
    return {
      id: row.id as string,
      customerId: row.customer_id as string,
      size: LockerSize.of(row.size_code as string),
      trackingRef: (row.tracking_ref as string | null) ?? null,
      status: row.status as PackageStatus,
      registeredAt: row.created_at as Date,
      storedAt: (row.stored_at as Date | null) ?? null,
      retrievedAt: (row.retrieved_at as Date | null) ?? null,
      storageFeeMinor:
        row.storage_fee_minor === null || row.storage_fee_minor === undefined
          ? null
          : Number(row.storage_fee_minor),
      locker: row.locker_id
        ? { id: row.locker_id as string, code: row.locker_code as string }
        : null,
      station: row.station_id
        ? { id: row.station_id as string, name: row.station_name as string }
        : null,
    };
  }
}

/**
 * The chosen column, then tiebreakers that make the order *total*. Without them
 * paging is unsound: rows tying on the sort column may come back in a different
 * order per query, so one repeats on a page and another vanishes from the next.
 * `stored_at`/`retrieved_at` are null for parcels that never got that far, and
 * MySQL sorts NULLs first ascending, last descending.
 */
function orderBy(sort: PackageSort): string {
  const direction = sort.direction === 'desc' ? 'DESC' : 'ASC';
  const columns = [`${SORT_EXPRESSIONS[sort.field]} ${direction}`];
  if (sort.field !== 'registeredAt') columns.push('p.created_at DESC');
  columns.push('p.id ASC');
  return columns.join(', ');
}
