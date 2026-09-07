import { InvalidLockerSizeError } from './errors.js';

export const LOCKER_SIZES = ['SMALL', 'MEDIUM', 'LARGE'] as const;
export type LockerSizeCode = (typeof LOCKER_SIZES)[number];

/**
 * Ordered locker/package size. `rank` gives the total ordering the allocator
 * needs ("smallest locker that fits"). Must stay in sync with the `locker_size`
 * seed in migrations/002_seed.sql (guarded by a test).
 */
const RANKS: Record<LockerSizeCode, number> = {
  SMALL: 10,
  MEDIUM: 20,
  LARGE: 30,
};

export class LockerSize {
  private constructor(
    readonly code: LockerSizeCode,
    readonly rank: number,
  ) {}

  static of(code: string): LockerSize {
    if (!(LOCKER_SIZES as readonly string[]).includes(code)) {
      throw new InvalidLockerSizeError(code);
    }
    const known = code as LockerSizeCode;
    return new LockerSize(known, RANKS[known]);
  }

  /** Can a locker of this size hold a package that needs `required`? */
  fits(required: LockerSize): boolean {
    return this.rank >= required.rank;
  }

  equals(other: LockerSize): boolean {
    return this.code === other.code;
  }
}
