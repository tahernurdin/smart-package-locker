import type { LockerSize } from '../../lockers/domain/locker-size.js';
import type { StorageRateSchedule } from './storage-rate-schedule.js';

export const STORAGE_RATE_CATALOG = Symbol('STORAGE_RATE_CATALOG');

export interface ListStorageRateVersionsFilter {
  /** Restrict to one size; all three when omitted. */
  size?: LockerSize;
}

/**
 * The operator port: publishing and reviewing rate versions. Insert-only by
 * design — there is no `update` or `delete`, because a published version is
 * what past fees were computed from.
 */
export interface StorageRateCatalog {
  /**
   * Persist every band of `schedule` atomically. Raises
   * `StorageRateVersionExistsError` if this size already has a version at that
   * instant, including when a concurrent publish wins the race.
   */
  publish(schedule: StorageRateSchedule): Promise<void>;

  /** Every version, newest `effectiveFrom` first. */
  listVersions(
    filter?: ListStorageRateVersionsFilter,
  ): Promise<StorageRateSchedule[]>;
}
