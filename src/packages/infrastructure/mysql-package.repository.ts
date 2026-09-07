import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import {
  duplicateEntryKey,
  isDuplicateEntryError,
} from '../../shared/database/mysql-errors.js';
import { MYSQL_POOL } from '../../shared/database/mysql.pool.js';
import {
  LockerJustTakenError,
  PickupCodeCollisionError,
} from '../domain/errors.js';
import type { Package } from '../domain/package.entity.js';
import type { PackageRepository } from '../domain/package.repository.js';

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
}
