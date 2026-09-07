import type { Locker } from './locker.entity.js';

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
  /** Retired lockers are hidden unless asked for. */
  includeDecommissioned?: boolean;
}

export interface LockerRepository {
  save(locker: Locker): Promise<void>;

  update(locker: Locker): Promise<void>;

  findById(id: string): Promise<Locker | null>;

  /** One locker with its derived occupancy and station — `GET /lockers/:id`. */
  findByIdWithOccupancy(id: string): Promise<LockerOccupancy | null>;

  existsByStationAndCode(stationId: string, code: string): Promise<boolean>;

  /**
   * Lockers with their derived occupancy and station, ordered by size then code.
   * The filter is an options object so paging/sorting can be added later without
   * changing callers (the locker bank is small enough not to need it today).
   */
  listWithOccupancy(filter?: ListLockersFilter): Promise<LockerOccupancy[]>;
}
