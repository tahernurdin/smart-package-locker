import { InvalidLockerSortError } from './errors.js';
import { DEFAULT_LOCKER_SORT, lockerSortOf } from './locker-sort.js';

describe('lockerSortOf', () => {
  it('defaults to smallest-size-first', () => {
    expect(lockerSortOf()).toEqual(DEFAULT_LOCKER_SORT);
    expect(DEFAULT_LOCKER_SORT).toEqual({ field: 'size', direction: 'asc' });
  });

  it('takes a known field and direction', () => {
    expect(lockerSortOf('code', 'desc')).toEqual({
      field: 'code',
      direction: 'desc',
    });
  });

  it('defaults each half independently', () => {
    expect(lockerSortOf('station')).toEqual({
      field: 'station',
      direction: 'asc',
    });
    expect(lockerSortOf(undefined, 'desc')).toEqual({
      field: 'size',
      direction: 'desc',
    });
  });

  // The DTO's @IsIn binds HTTP callers only; nothing unvetted may reach ORDER BY.
  it('rejects a field that is not on the whitelist', () => {
    expect(() => lockerSortOf('l.code; DROP TABLE locker')).toThrow(
      InvalidLockerSortError,
    );
    expect(() => lockerSortOf('stationName')).toThrow(InvalidLockerSortError);
  });

  it('rejects an unknown direction', () => {
    expect(() => lockerSortOf('code', 'sideways')).toThrow(
      InvalidLockerSortError,
    );
    expect(() => lockerSortOf('code', 'ASC')).toThrow(InvalidLockerSortError);
  });
});
