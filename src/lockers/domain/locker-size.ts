import { InvalidLockerSizeError } from './errors.js';

export const LOCKER_SIZES = ['SMALL', 'MEDIUM', 'LARGE'] as const;
export type LockerSizeCode = (typeof LOCKER_SIZES)[number];

/**
 * Ordered locker/package size. This is the single source of truth for the size
 * set and its ordering. `rank` gives the total ordering the allocator needs
 * ("smallest locker that fits"), and gaps (10/20/30) leave room to insert a
 * size between two existing ones.
 *
 * The DB stores `size_code` as a CHECK-constrained enum plus a generated
 * `locker.size_rank` column holding these same numbers (migration 005), so the
 * allocator compares `size_rank >= :sizeRank` against a rank sent from here.
 * Renumbering below therefore requires a migration — see the spec that pins it.
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
