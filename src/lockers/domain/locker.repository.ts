import type { Locker } from './locker.entity.js';
import type { LockerSize } from './locker-size.js';

export const LOCKER_REPOSITORY = Symbol('LOCKER_REPOSITORY');

export interface LockerStationSummary {
  id: string;
  name: string;
  location: string | null;
}

export interface LockerOccupancy {
  locker: Locker;
  /** id of the package currently in the locker, or null when free */
  activePackageId: string | null;
  station: LockerStationSummary;
}

export interface ListLockersFilter {
  stationId?: string;
}

export interface LockerRepository {
  save(locker: Locker): Promise<void>;

  findById(id: string): Promise<Locker | null>;

  existsByStationAndCode(stationId: string, code: string): Promise<boolean>;

  /**
   * Lockers with their derived occupancy and station, ordered by size then code.
   * The filter is an options object so paging/sorting can be added later without
   * changing callers (the locker bank is small enough not to need it today).
   */
  listWithOccupancy(filter?: ListLockersFilter): Promise<LockerOccupancy[]>;

  /**
   * Smallest serviceable, currently-free locker at the station that fits a
   * package of `required` size, or null. Used when storing a package.
   */
  findAvailableSmallestFit(
    stationId: string,
    required: LockerSize,
  ): Promise<Locker | null>;
}
