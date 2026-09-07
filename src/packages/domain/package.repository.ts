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
}
