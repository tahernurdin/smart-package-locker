import { InvalidLockerSizeError } from './errors.js';
import { LockerSize } from './locker-size.js';

describe('LockerSize', () => {
  it('ranks SMALL < MEDIUM < LARGE', () => {
    expect(LockerSize.of('SMALL').rank).toBeLessThan(LockerSize.of('MEDIUM').rank);
    expect(LockerSize.of('MEDIUM').rank).toBeLessThan(LockerSize.of('LARGE').rank);
  });

  /**
   * `locker.size_rank` (migration 005) is a generated column holding these exact
   * numbers, and the allocator compares the two directly — it sends `rank` as a
   * bind parameter against the column. Renumbering the ranks here without
   * rewriting that migration would not fail to compile or throw: it would
   * quietly satisfy `size_rank >= :sizeRank` for the wrong lockers and hand a
   * MEDIUM parcel a SMALL box. Changing these values means changing 005 too.
   */
  it('pins the rank values migration 005 hard-codes', () => {
    expect({
      SMALL: LockerSize.of('SMALL').rank,
      MEDIUM: LockerSize.of('MEDIUM').rank,
      LARGE: LockerSize.of('LARGE').rank,
    }).toEqual({ SMALL: 10, MEDIUM: 20, LARGE: 30 });
  });

  it('a larger (or equal) locker fits a package', () => {
    expect(LockerSize.of('MEDIUM').fits(LockerSize.of('SMALL'))).toBe(true);
    expect(LockerSize.of('LARGE').fits(LockerSize.of('LARGE'))).toBe(true);
  });

  it('a smaller locker does not fit a larger package', () => {
    expect(LockerSize.of('SMALL').fits(LockerSize.of('LARGE'))).toBe(false);
    expect(LockerSize.of('MEDIUM').fits(LockerSize.of('LARGE'))).toBe(false);
  });

  it('rejects an unknown size', () => {
    expect(() => LockerSize.of('HUGE')).toThrow(InvalidLockerSizeError);
  });
});
