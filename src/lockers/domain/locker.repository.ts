import type { PageRequest } from '../../shared/pagination/page.js';
import type { LockerAvailability } from './locker-availability.js';
import type { LockerSize } from './locker-size.js';
import type { LockerSort } from './locker-sort.js';
import type { LockerStatus } from './locker-status.js';
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
  size?: LockerSize;
  status?: LockerStatus;
  availability?: LockerAvailability;
  /**
   * Retired lockers are hidden unless asked for — either by this flag or by
   * naming `status: 'DECOMMISSIONED'`, which would otherwise match nothing.
   */
  includeDecommissioned?: boolean;
}

/** Everything `GET /lockers` needs: which rows, in what order, which window. */
export interface ListLockersQuery {
  filter: ListLockersFilter;
  sort: LockerSort;
  page: PageRequest;
}

export interface LockerOccupancyPage {
  rows: LockerOccupancy[];
  /** Rows matching the filter, ignoring the window. */
  total: number;
}

export interface LockerRepository {
  save(locker: Locker): Promise<void>;

  update(locker: Locker): Promise<void>;

  findById(id: string): Promise<Locker | null>;

  /** One locker with its derived occupancy and station — `GET /lockers/:id`. */
  findByIdWithOccupancy(id: string): Promise<LockerOccupancy | null>;

  existsByStationAndCode(stationId: string, code: string): Promise<boolean>;

  /**
   * One page of lockers with their derived occupancy and station, plus the
   * total behind it. The window is required, not optional: an unfiltered bank
   * spans every station, so there is no caller allowed an unbounded scan.
   */
  listWithOccupancy(query: ListLockersQuery): Promise<LockerOccupancyPage>;
}
