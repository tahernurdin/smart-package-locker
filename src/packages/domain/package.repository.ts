import type { Package } from './package.entity.js';

export const PACKAGE_REPOSITORY = Symbol('PACKAGE_REPOSITORY');

export interface PackageRepository {
  /**
   * Persists a newly stored package. Translates the DB's unique-constraint
   * violations:
   *  - active_locker_id  -> {@link LockerJustTakenError}
   *  - active pickup hash -> {@link PickupCodeCollisionError}
   */
  save(pkg: Package): Promise<void>;

  /** The package currently in the locker (retrieved_at IS NULL), or null. */
  findActiveByLocker(lockerId: string): Promise<Package | null>;

  /**
   * Marks a package retrieved. The update is conditional on it still being
   * active, so a concurrent second retrieval throws
   * {@link PackageAlreadyRetrievedError} instead of both succeeding.
   */
  markRetrieved(pkg: Package): Promise<void>;
}
