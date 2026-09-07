import { Inject, Injectable } from '@nestjs/common';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import {
  duplicateEntryKey,
  isDuplicateEntryError,
} from '../../shared/database/mysql-errors.js';
import { MYSQL_POOL } from '../../shared/database/mysql.pool.js';
import {
  LockerJustTakenError,
  PackageAlreadyRetrievedError,
  PickupCodeCollisionError,
} from '../domain/errors.js';
import { Package } from '../domain/package.entity.js';
import type { PackageRepository } from '../domain/package.repository.js';

const PACKAGE_COLUMNS = `id, locker_id, customer_id, size_code, pickup_code_hash,
  tracking_ref, stored_by_agent, stored_at, retrieved_at, storage_fee_minor`;

@Injectable()
export class MysqlPackageRepository implements PackageRepository {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async save(pkg: Package): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO package
           (id, locker_id, customer_id, size_code, pickup_code_hash,
            tracking_ref, stored_by_agent, stored_at)
         VALUES
           (:id, :lockerId, :customerId, :sizeCode, :pickupCodeHash,
            :trackingRef, :storedByAgent, :storedAt)`,
        {
          id: pkg.id,
          lockerId: pkg.lockerId,
          customerId: pkg.customerId,
          sizeCode: pkg.size.code,
          pickupCodeHash: pkg.pickupCodeHash,
          trackingRef: pkg.trackingRef,
          storedByAgent: pkg.storedByAgent,
          storedAt: pkg.storedAt,
        },
      );
    } catch (err) {
      if (isDuplicateEntryError(err)) {
        const key = duplicateEntryKey(err) ?? '';
        throw key.includes('pickup_code')
          ? new PickupCodeCollisionError()
          : new LockerJustTakenError();
      }
      throw err;
    }
  }

  async findActiveByLocker(lockerId: string): Promise<Package | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ${PACKAGE_COLUMNS} FROM package WHERE active_locker_id = :lockerId LIMIT 1`,
      { lockerId },
    );
    return rows.length ? this.toPackage(rows[0]) : null;
  }

  async markRetrieved(pkg: Package): Promise<void> {
    const [result] = await this.pool.query<ResultSetHeader>(
      `UPDATE package
       SET retrieved_at = :retrievedAt, storage_fee_minor = :fee
       WHERE id = :id AND retrieved_at IS NULL`,
      { retrievedAt: pkg.retrievedAt, fee: pkg.storageFeeMinor, id: pkg.id },
    );
    if (result.affectedRows === 0) throw new PackageAlreadyRetrievedError();
  }

  private toPackage(row: RowDataPacket): Package {
    return Package.fromPersistence({
      id: row.id as string,
      lockerId: row.locker_id as string,
      customerId: row.customer_id as string,
      size: LockerSize.of(row.size_code as string),
      pickupCodeHash: row.pickup_code_hash as string,
      trackingRef: (row.tracking_ref as string | null) ?? null,
      storedByAgent: (row.stored_by_agent as string | null) ?? null,
      storedAt: row.stored_at as Date,
      retrievedAt: (row.retrieved_at as Date | null) ?? null,
      storageFeeMinor:
        row.storage_fee_minor === null ? null : Number(row.storage_fee_minor),
    });
  }
}
