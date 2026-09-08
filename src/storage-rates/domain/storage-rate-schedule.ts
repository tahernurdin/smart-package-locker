import type { LockerSize } from '../../lockers/domain/locker-size.js';
import {
  InvalidStorageRateScheduleError,
  StorageRateBackdatedError,
} from './errors.js';
import { StorageRateBand } from './storage-rate.js';

/** A band together with the identity of the row that stores it. */
export interface StorageRateBandEntry {
  readonly id: string;
  readonly band: StorageRateBand;
}

export interface StorageRateBandInput {
  fromDay: number;
  toDay: number | null;
  rateMinor: number;
}

/**
 * Every band of one published version of one size's prices.
 *
 * The unit of change is the whole schedule, not a band: an operator publishes a
 * new version at a future `effectiveFrom` and the previous one stops applying
 * the instant this one starts. Published versions are immutable, which is what
 * lets a fee be recomputed at retrieval from the rate that was posted when the
 * package went in.
 *
 * The invariant this type exists for: the bands must tile `[0, ∞)` — start at
 * day 0, meet exactly at their edges, and end open-ended. A gap or an overlap
 * would make `calculateStorageFeeMinor` throw for every package of this size,
 * and MySQL has no range-exclusion constraint to catch it at the column level.
 */
export class StorageRateSchedule {
  private constructor(
    readonly size: LockerSize,
    readonly effectiveFrom: Date,
    readonly entries: readonly StorageRateBandEntry[],
    readonly createdAt: Date,
    readonly updatedAt: Date,
  ) {}

  /**
   * Validate operator input into a publishable version. `nextId` supplies one id
   * per band (injected, so tests stay deterministic) and `now` is the clock
   * reading that decides whether `effectiveFrom` is still in the future.
   */
  static publish(params: {
    size: LockerSize;
    effectiveFrom: Date;
    bands: readonly StorageRateBandInput[];
    nextId: () => string;
    now: Date;
  }): StorageRateSchedule {
    const { size, effectiveFrom, bands, nextId, now } = params;

    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new InvalidStorageRateScheduleError('effectiveFrom is not a date');
    }
    if (effectiveFrom.getTime() <= now.getTime()) {
      throw new StorageRateBackdatedError(effectiveFrom, now);
    }
    if (bands.length === 0) {
      throw new InvalidStorageRateScheduleError(
        'a rate version needs at least one band',
      );
    }

    // Sorted, not required-in-order: the order bands arrive in carries no
    // meaning, and the tiling check below still catches every duplicate,
    // overlap and gap.
    const ordered = bands
      .map((band) => StorageRateBand.of(band))
      .sort((a, b) => a.fromDay - b.fromDay);

    if (ordered[0].fromDay !== 0) {
      throw new InvalidStorageRateScheduleError(
        `bands must start at day 0, got ${ordered[0].fromDay}`,
        { fromDay: ordered[0].fromDay },
      );
    }
    for (let i = 0; i < ordered.length - 1; i++) {
      if (ordered[i].toDay !== ordered[i + 1].fromDay) {
        throw new InvalidStorageRateScheduleError(
          `bands must be contiguous: band ending ${ordered[i].toDay} is followed by one starting ${ordered[i + 1].fromDay}`,
          { toDay: ordered[i].toDay, nextFromDay: ordered[i + 1].fromDay },
        );
      }
    }
    const last = ordered[ordered.length - 1];
    if (last.toDay !== null) {
      throw new InvalidStorageRateScheduleError(
        `the last band must be open-ended (toDay null), got ${last.toDay}`,
        { toDay: last.toDay },
      );
    }

    return new StorageRateSchedule(
      size,
      effectiveFrom,
      ordered.map((band) => ({ id: nextId(), band })),
      now,
      now,
    );
  }

  /**
   * Rehydrate a stored version. Deliberately skips the tiling check `publish`
   * runs: a version written before this type existed (or edited by hand) must
   * still be listable, so an operator can see what is wrong with it. The fee
   * path keeps its own guard for that case.
   */
  static fromPersistence(params: {
    size: LockerSize;
    effectiveFrom: Date;
    entries: readonly StorageRateBandEntry[];
    createdAt: Date;
    updatedAt: Date;
  }): StorageRateSchedule {
    return new StorageRateSchedule(
      params.size,
      params.effectiveFrom,
      params.entries,
      params.createdAt,
      params.updatedAt,
    );
  }

  get bands(): readonly StorageRateBand[] {
    return this.entries.map((entry) => entry.band);
  }
}
