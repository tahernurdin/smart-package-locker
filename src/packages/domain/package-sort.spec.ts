import { InvalidPackageSortError } from './errors.js';
import { DEFAULT_PACKAGE_SORT, packageSortOf } from './package-sort.js';

describe('packageSortOf', () => {
  it('defaults to newest first', () => {
    expect(packageSortOf()).toEqual(DEFAULT_PACKAGE_SORT);
    expect(DEFAULT_PACKAGE_SORT).toEqual({
      field: 'registeredAt',
      direction: 'desc',
    });
  });

  it('takes a known field and direction', () => {
    expect(packageSortOf('storedAt', 'asc')).toEqual({
      field: 'storedAt',
      direction: 'asc',
    });
  });

  it('defaults each half independently', () => {
    expect(packageSortOf('station')).toEqual({
      field: 'station',
      direction: 'desc',
    });
    expect(packageSortOf(undefined, 'asc')).toEqual({
      field: 'registeredAt',
      direction: 'asc',
    });
  });

  // `status` and `size` are filters: three values make a grouping, not a sort.
  // `ORDER BY p.status` was also alphabetical, putting RETRIEVED before STORED.
  it('does not offer the low-cardinality fields as sorts', () => {
    for (const field of ['status', 'size']) {
      expect(() => packageSortOf(field)).toThrow(InvalidPackageSortError);
    }
  });

  // The DTO's @IsIn binds HTTP callers only; nothing unvetted may reach ORDER BY.
  it('rejects a field that is not on the whitelist', () => {
    expect(() => packageSortOf('p.created_at; DROP TABLE package')).toThrow(
      InvalidPackageSortError,
    );
    expect(() => packageSortOf('pickupCodeHash')).toThrow(
      InvalidPackageSortError,
    );
  });

  it('rejects an unknown direction', () => {
    expect(() => packageSortOf('storedAt', 'sideways')).toThrow(
      InvalidPackageSortError,
    );
  });
});
