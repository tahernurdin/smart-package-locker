import type { LockerSizeCode } from '../../lockers/domain/locker-size.js';
import type { PackageListingRow } from '../domain/package-listing.repository.js';
import type { PackageStatus } from '../domain/package-status.js';

/** The row shape both package listings answer with. Never carries the pickup code. */
export interface PackageView {
  id: string;
  customerId: string;
  size: LockerSizeCode;
  trackingRef: string | null;
  status: PackageStatus;
  registeredAt: Date;
  storedAt: Date | null;
  retrievedAt: Date | null;
  /** Only once collected — the fee is charged on retrieval. */
  storageFee: { amountMinor: number; currency: string } | null;
  lockerId: string | null;
  lockerCode: string | null;
  stationId: string | null;
  stationName: string | null;
}

export function toPackageView(
  row: PackageListingRow,
  currency: string,
): PackageView {
  return {
    id: row.id,
    customerId: row.customerId,
    size: row.size.code,
    trackingRef: row.trackingRef,
    status: row.status,
    registeredAt: row.registeredAt,
    storedAt: row.storedAt,
    retrievedAt: row.retrievedAt,
    storageFee:
      row.storageFeeMinor === null
        ? null
        : { amountMinor: row.storageFeeMinor, currency },
    lockerId: row.locker?.id ?? null,
    lockerCode: row.locker?.code ?? null,
    stationId: row.station?.id ?? null,
    stationName: row.station?.name ?? null,
  };
}
