import type { LockerStation } from './locker-station.entity.js';

export const STATION_REPOSITORY = Symbol('STATION_REPOSITORY');

export interface ListStationsFilter {
  /** Retired stations are hidden unless asked for. */
  includeDecommissioned?: boolean;
}

export interface StationRepository {
  save(station: LockerStation): Promise<void>;

  update(station: LockerStation): Promise<void>;

  findById(id: string): Promise<LockerStation | null>;

  list(filter?: ListStationsFilter): Promise<LockerStation[]>;

  /**
   * Lockers still standing at this station (anything not DECOMMISSIONED) —
   * the guard on retiring a station.
   *
   * It reads the `locker` table, which the lockers context owns. It lives here
   * rather than on `LockerRepository` to keep the module graph acyclic: lockers
   * already depends on stations (a locker is created *at* a station), so the
   * reverse edge would be a cycle. Only the MySQL adapter knows the table; the
   * port stays a plain question about a station.
   */
  countLiveLockers(stationId: string): Promise<number>;
}
