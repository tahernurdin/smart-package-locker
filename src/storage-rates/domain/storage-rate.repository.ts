import type { LockerSize } from '../../lockers/domain/locker-size.js';
import type { StorageRateBand } from './storage-rate.js';

export const STORAGE_RATE_REPOSITORY = Symbol('STORAGE_RATE_REPOSITORY');

/**
 * The read port, kept to the single question the fee path asks. The operator
 * side of the same table is a separate role — see `StorageRateCatalog` — so
 * nothing on the retrieval hot path can reach a write.
 */
export interface StorageRateRepository {
  /**
   * Rate bands for `size` from the newest version whose `effective_from` is at
   * or before `asOf`, ordered by `fromDay`. Empty when none applies. Callers pass
   * `storedAt` as `asOf` — the rate that was posted when the package went in.
   * A version dated in the future is invisible until it takes effect.
   */
  findBandsFor(size: LockerSize, asOf: Date): Promise<StorageRateBand[]>;
}
