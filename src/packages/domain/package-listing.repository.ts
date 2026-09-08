import type { LockerSize } from '../../lockers/domain/locker-size.js';
import type { PageRequest } from '../../shared/pagination/page.js';
import type { PackageSort } from './package-sort.js';
import type { PackageStatus } from './package-status.js';

export const PACKAGE_LISTING_REPOSITORY = Symbol('PACKAGE_LISTING_REPOSITORY');

/**
 * A package as a listing shows it: the parcel, plus where it is (or was) and
 * what the stay cost. Deliberately *not* the `Package` aggregate — loading that
 * means loading `pickup_code_hash`, and a read model that never holds the
 * secret cannot leak it into a response.
 */
export interface PackageListingRow {
  id: string;
  customerId: string;
  size: LockerSize;
  trackingRef: string | null;
  status: PackageStatus;
  registeredAt: Date;
  /** Null until an agent drops it in a locker. */
  storedAt: Date | null;
  /** Null until the customer collects it. */
  retrievedAt: Date | null;
  /** Charged on collection, so null until then. Integer minor units. */
  storageFeeMinor: number | null;
  locker: { id: string; code: string } | null;
  station: { id: string; name: string } | null;
}

export interface ListPackagesFilter {
  /**
   * Whose packages. Forced from the authenticated subject on the customer's own
   * listing, and never read from that request's query — see
   * `ListMyPackagesService`.
   */
  customerId?: string;
  status?: PackageStatus;
  size?: LockerSize;
  /** Where it is stored now, or was stored last. Excludes never-stored parcels. */
  stationId?: string;
  lockerId?: string;
  trackingRef?: string;
}

export interface ListPackagesQuery {
  filter: ListPackagesFilter;
  sort: PackageSort;
  page: PageRequest;
}

export interface PackageListingPage {
  rows: PackageListingRow[];
  /** Rows matching the filter, ignoring the window. */
  total: number;
}

/**
 * The read side of packages, split from `PackageRepository` (which is the
 * transactional write side) so neither grows the other's concerns.
 */
export interface PackageListingRepository {
  list(query: ListPackagesQuery): Promise<PackageListingPage>;
}
