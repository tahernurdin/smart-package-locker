import type { LockerSize } from '../../lockers/domain/locker-size.js';
import type { StorageRateBand } from './storage-rate.js';

export const STORAGE_RATE_REPOSITORY = Symbol('STORAGE_RATE_REPOSITORY');

export interface StorageRateRepository {
  /**
   * Rate bands for `size` from the newest version whose `effective_from` is at
   * or before `asOf`, sorted by `fromDay`. The fee policy passes the package's
   * `storedAt` as `asOf` — the rate that was posted when the package went in.
   * Empty when no version is effective yet.
   */
  findBandsFor(size: LockerSize, asOf: Date): Promise<StorageRateBand[]>;
}
