import type { Locker } from './locker.entity.js';
import type { LockerSize } from './locker-size.js';

export const LOCKER_REPOSITORY = Symbol('LOCKER_REPOSITORY');

export interface LockerOccupancy {
  locker: Locker;
  /** id of the package currently in the locker, or null when free */
  activePackageId: string | null;
}

export interface LockerRepository {
  save(locker: Locker): Promise<void>;

  existsByStationAndCode(stationId: string, code: string): Promise<boolean>;

  /** Every locker with its derived occupancy, ordered by size then code. */
  listWithOccupancy(): Promise<LockerOccupancy[]>;

  /**
   * Smallest serviceable, currently-free locker at the station that fits a
   * package of `required` size, or null. Used when storing a package.
   */
  findAvailableSmallestFit(
    stationId: string,
    required: LockerSize,
  ): Promise<Locker | null>;
}
