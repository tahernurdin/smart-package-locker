import type { LockerSize } from '../../lockers/domain/locker-size.js';
import type { Package } from './package.entity.js';

export const PACKAGE_REPOSITORY = Symbol('PACKAGE_REPOSITORY');

export interface ReservedLocker {
  lockerId: string;
  lockerCode: string;
}

export interface ReserveLockerAndStoreParams {
  packageId: string;
  stationId: string;
  requiredSize: LockerSize;
  storedAt: Date;
  /**
   * Builds the stored `Package` for the locker the repository picked (the locker
   * id is only known mid-transaction). Its `assignment` is the row to insert.
   */
  build: (lockerId: string) => Package;
}

export interface PackageRepository {
  /** Insert a newly `REGISTERED` package (no assignment yet). */
  save(pkg: Package): Promise<void>;

  /** Load the package and its assignment (if any); null when absent. */
  findById(id: string): Promise<Package | null>;

  /** Package with the active assignment where `active_locker_id = ?`, or null. */
  findActiveByLocker(lockerId: string): Promise<Package | null>;

  /**
   * One transaction: pick the smallest free serviceable locker at `stationId`
   * that fits `requiredSize` (`FOR UPDATE ... SKIP LOCKED`, so concurrent
   * callers get a different one), insert the assignment from `build`, flip the
   * package to `STORED`. null when nothing fits. Maps a DB unique violation to
   * `LockerJustTakenError`; a concurrent store of the same package throws
   * `PackageAlreadyStoredError`.
   */
  reserveLockerAndStore(
    params: ReserveLockerAndStoreParams,
  ): Promise<ReservedLocker | null>;

  /**
   * Write the new pickup-code hash onto the open assignment. Conditional on the
   * assignment still being open, so a code cannot be re-issued into a parcel
   * that was collected a moment ago — that throws `PackageAlreadyRetrievedError`.
   */
  savePickupCode(pkg: Package): Promise<void>;

  /**
   * Close the assignment (`retrieved_at`, `storage_fee_minor`) and flip the
   * package to `RETRIEVED`, in one transaction. A concurrent retrieval that got
   * there first throws `PackageAlreadyRetrievedError`.
   */
  saveRetrieval(pkg: Package): Promise<void>;
}
