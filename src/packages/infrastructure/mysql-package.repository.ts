import { Inject, Injectable } from '@nestjs/common';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import { isDuplicateEntryError } from '../../shared/database/mysql-errors.js';
import { MYSQL_POOL } from '../../shared/database/mysql.pool.js';
import { sizeOrderExpr } from '../../shared/database/size-order.js';
import { withTransaction } from '../../shared/database/transaction.js';
import {
  LockerJustTakenError,
  PackageAlreadyRetrievedError,
  PackageAlreadyStoredError,
} from '../domain/errors.js';
import { LockerAssignment } from '../domain/locker-assignment.entity.js';
import { Package } from '../domain/package.entity.js';
import type {
  PackageRepository,
  ReserveLockerAndStoreParams,
  ReservedLocker,
} from '../domain/package.repository.js';
import type { PackageStatus } from '../domain/package-status.js';

const PACKAGE_SELECT = `
  p.id, p.customer_id, p.size_code, p.tracking_ref, p.status,
  p.created_at, p.updated_at,
  la.id AS a_id, la.locker_id AS a_locker_id, la.pickup_code_hash AS a_hash,
  la.stored_by_agent AS a_agent, la.stored_at AS a_stored_at,
  la.retrieved_at AS a_retrieved_at, la.storage_fee_minor AS a_fee`;

@Injectable()
export class MysqlPackageRepository implements PackageRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async save(pkg: Package): Promise<void> {
    await this.pool.query(
      `INSERT INTO package
         (id, customer_id, size_code, tracking_ref, status, created_at, updated_at)
       VALUES (:id, :customerId, :sizeCode, :trackingRef, :status, :createdAt, :updatedAt)`,
      {
        id: pkg.id,
        customerId: pkg.customerId,
        sizeCode: pkg.size.code,
        trackingRef: pkg.trackingRef,
        status: pkg.status,
        createdAt: pkg.createdAt,
        updatedAt: pkg.updatedAt,
      },
    );
  }

  async findById(id: string): Promise<Package | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ${PACKAGE_SELECT}
       FROM package p
       LEFT JOIN locker_assignment la ON la.package_id = p.id
       WHERE p.id = :id
       LIMIT 1`,
      { id },
    );
    return rows.length ? this.toPackage(rows[0]) : null;
  }

  async findActiveByLocker(lockerId: string): Promise<Package | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ${PACKAGE_SELECT}
       FROM locker_assignment la
       JOIN package p ON p.id = la.package_id
       WHERE la.active_locker_id = :lockerId
       LIMIT 1`,
      { lockerId },
    );
    return rows.length ? this.toPackage(rows[0]) : null;
  }

  async reserveLockerAndStore(
    params: ReserveLockerAndStoreParams,
  ): Promise<ReservedLocker | null> {
    return withTransaction(this.pool, async (conn) => {
      const [lockerRows] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.code
         FROM locker l
         LEFT JOIN locker_assignment la ON la.active_locker_id = l.id
         WHERE l.station_id = :stationId
           AND l.status = 'IN_SERVICE'
           AND la.id IS NULL
           AND ${sizeOrderExpr('l.size_code')} >= ${sizeOrderExpr(':sizeCode')}
         ORDER BY ${sizeOrderExpr('l.size_code')} ASC, l.code ASC
         LIMIT 1
         FOR UPDATE OF l SKIP LOCKED`,
        { stationId: params.stationId, sizeCode: params.requiredSize.code },
      );
      if (lockerRows.length === 0) return null;

      const lockerId = lockerRows[0].id as string;
      const lockerCode = lockerRows[0].code as string;

      const stored = params.build(lockerId);
      const assignment = stored.assignment;
      if (!assignment) {
        throw new Error('reserveLockerAndStore: build produced no assignment');
      }

      try {
        await conn.query(
          `INSERT INTO locker_assignment
             (id, package_id, locker_id, pickup_code_hash, stored_by_agent, stored_at)
           VALUES (:id, :packageId, :lockerId, :pickupCodeHash, :storedByAgent, :storedAt)`,
          {
            id: assignment.id,
            packageId: params.packageId,
            lockerId: assignment.lockerId,
            pickupCodeHash: assignment.pickupCodeHash,
            storedByAgent: assignment.storedByAgent,
            storedAt: assignment.storedAt,
          },
        );
      } catch (err) {
        // uq_one_active_assignment_per_locker is the only unique key this insert
        // can violate: another request claimed the locker after our SELECT.
        if (isDuplicateEntryError(err)) throw new LockerJustTakenError();
        throw err;
      }

      const [res] = await conn.query<ResultSetHeader>(
        `UPDATE package SET status = 'STORED', updated_at = :updatedAt
         WHERE id = :packageId AND status = 'REGISTERED'`,
        { updatedAt: assignment.storedAt, packageId: params.packageId },
      );
      if (res.affectedRows === 0) throw new PackageAlreadyStoredError();

      return { lockerId, lockerCode };
    });
  }

  async saveRetrieval(pkg: Package): Promise<void> {
    const assignment = pkg.assignment;
    if (!assignment) {
      throw new Error('saveRetrieval: package has no assignment');
    }
    await withTransaction(this.pool, async (conn) => {
      const [res] = await conn.query<ResultSetHeader>(
        `UPDATE locker_assignment
         SET retrieved_at = :retrievedAt, storage_fee_minor = :fee
         WHERE id = :id AND retrieved_at IS NULL`,
        {
          retrievedAt: assignment.retrievedAt,
          fee: assignment.storageFeeMinor,
          id: assignment.id,
        },
      );
      if (res.affectedRows === 0) throw new PackageAlreadyRetrievedError();

      await conn.query(
        `UPDATE package SET status = 'RETRIEVED', updated_at = :updatedAt WHERE id = :id`,
        { updatedAt: assignment.retrievedAt, id: pkg.id },
      );
    });
  }

  private toPackage(row: RowDataPacket): Package {
    const assignment = row.a_id
      ? LockerAssignment.fromPersistence({
          id: row.a_id as string,
          lockerId: row.a_locker_id as string,
          pickupCodeHash: row.a_hash as string,
          storedByAgent: (row.a_agent as string | null) ?? null,
          storedAt: row.a_stored_at as Date,
          retrievedAt: (row.a_retrieved_at as Date | null) ?? null,
          storageFeeMinor:
            row.a_fee === null || row.a_fee === undefined
              ? null
              : Number(row.a_fee),
        })
      : null;

    return Package.fromPersistence({
      id: row.id as string,
      customerId: row.customer_id as string,
      size: LockerSize.of(row.size_code as string),
      trackingRef: (row.tracking_ref as string | null) ?? null,
      status: row.status as PackageStatus,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
      assignment,
    });
  }
}
