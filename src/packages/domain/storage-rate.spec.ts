import { StorageRateBand, StorageRateConfigError } from './storage-rate.js';

describe('StorageRateBand', () => {
  it('accepts a valid closed band and an open-ended tail', () => {
    expect(() =>
      StorageRateBand.of({ fromDay: 1, toDay: 3, rateMinor: 600 }),
    ).not.toThrow();
    expect(() =>
      StorageRateBand.of({ fromDay: 6, toDay: null, rateMinor: 1000 }),
    ).not.toThrow();
  });

  it('rejects a negative or non-integer fromDay', () => {
    expect(() =>
      StorageRateBand.of({ fromDay: -1, toDay: 2, rateMinor: 0 }),
    ).toThrow(StorageRateConfigError);
    expect(() =>
      StorageRateBand.of({ fromDay: 1.5, toDay: 2, rateMinor: 0 }),
    ).toThrow(StorageRateConfigError);
  });

  it('rejects toDay <= fromDay', () => {
    expect(() =>
      StorageRateBand.of({ fromDay: 3, toDay: 3, rateMinor: 0 }),
    ).toThrow(StorageRateConfigError);
    expect(() =>
      StorageRateBand.of({ fromDay: 3, toDay: 1, rateMinor: 0 }),
    ).toThrow(StorageRateConfigError);
  });

  it('rejects a negative rate', () => {
    expect(() =>
      StorageRateBand.of({ fromDay: 0, toDay: 1, rateMinor: -1 }),
    ).toThrow(StorageRateConfigError);
  });

  it('covers only the half-open interval', () => {
    const band = StorageRateBand.of({ fromDay: 1, toDay: 3, rateMinor: 600 });
    expect(band.covers(0)).toBe(false);
    expect(band.covers(1)).toBe(true);
    expect(band.covers(2)).toBe(true);
    expect(band.covers(3)).toBe(false);

    const tail = StorageRateBand.of({ fromDay: 6, toDay: null, rateMinor: 1000 });
    expect(tail.covers(5)).toBe(false);
    expect(tail.covers(6)).toBe(true);
    expect(tail.covers(9999)).toBe(true);
  });
});
