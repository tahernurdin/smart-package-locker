/**
 * A misconfigured rate table (bad band, gap, missing size) is an operational
 * bug, not a client error — thrown as a plain error so the filter maps it to 500
 * without leaking details.
 */
export class StorageRateConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageRateConfigError';
  }
}

/**
 * One half-open `[fromDay, toDay)` per-day rate band. `toDay === null` is the
 * open-ended tail. All money is integer minor units.
 */
export class StorageRateBand {
  private constructor(
    readonly fromDay: number,
    readonly toDay: number | null,
    readonly rateMinor: number,
  ) {}

  static of(params: {
    fromDay: number;
    toDay: number | null;
    rateMinor: number;
  }): StorageRateBand {
    const { fromDay, toDay, rateMinor } = params;
    if (!Number.isInteger(fromDay) || fromDay < 0) {
      throw new StorageRateConfigError(
        `rate band fromDay must be a non-negative integer, got ${fromDay}`,
      );
    }
    if (toDay !== null && (!Number.isInteger(toDay) || toDay <= fromDay)) {
      throw new StorageRateConfigError(
        `rate band toDay must be an integer greater than fromDay (${fromDay}), got ${toDay}`,
      );
    }
    if (!Number.isInteger(rateMinor) || rateMinor < 0) {
      throw new StorageRateConfigError(
        `rate band rateMinor must be a non-negative integer, got ${rateMinor}`,
      );
    }
    return new StorageRateBand(fromDay, toDay, rateMinor);
  }

  /** Whether day index `d` (0-based) falls in this band. */
  covers(day: number): boolean {
    return day >= this.fromDay && (this.toDay === null || day < this.toDay);
  }
}
