import { StorageRateConfigError } from '../../storage-rates/domain/errors.js';
import type { StorageRateBand } from '../../storage-rates/domain/storage-rate.js';

const DAY_MS = 86_400_000;

/**
 * Total storage fee in minor units for a stay from `storedAt` to `retrievedAt`.
 *
 * A "day" is a 24h window from `storedAt`; every day *started* is charged
 * (`ceil`), so a same-instant retrieval is free and 24h + 1ms costs two days.
 * `bands` must be sorted by `fromDay` and cover `[0, chargeableDays)`
 * contiguously from 0 — a gap or a non-zero start means the rate table is
 * misconfigured and throws rather than silently undercharging.
 */
export function calculateStorageFeeMinor(
  bands: StorageRateBand[],
  storedAt: Date,
  retrievedAt: Date,
): number {
  const durationMs = retrievedAt.getTime() - storedAt.getTime();
  const chargeableDays = Math.max(0, Math.ceil(durationMs / DAY_MS));
  if (chargeableDays === 0) return 0;

  let total = 0;
  let covered = 0;
  for (const band of bands) {
    const end =
      band.toDay === null
        ? chargeableDays
        : Math.min(band.toDay, chargeableDays);
    const daysInBand = Math.max(0, end - band.fromDay);
    total += daysInBand * band.rateMinor;
    covered += daysInBand;
  }

  if (covered !== chargeableDays) {
    throw new StorageRateConfigError(
      `rate bands cover ${covered} of ${chargeableDays} chargeable day(s) — gap, overlap, or non-zero start`,
    );
  }
  return total;
}
