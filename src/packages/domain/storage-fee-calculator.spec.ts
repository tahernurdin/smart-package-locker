import { calculateStorageFeeMinor } from './storage-fee-calculator.js';
import { StorageRateConfigError } from '../../storage-rates/domain/errors.js';
import { StorageRateBand } from '../../storage-rates/domain/storage-rate.js';

const HOURS = 3_600_000;
const DAYS = 86_400_000;
const T0 = new Date('2026-06-01T12:00:00.000Z');
const after = (ms: number) => new Date(T0.getTime() + ms);

const bands = (spec: [number, number | null, number][]): StorageRateBand[] =>
  spec.map(([fromDay, toDay, rateMinor]) =>
    StorageRateBand.of({ fromDay, toDay, rateMinor }),
  );

const SMALL = bands([
  [0, 1, 0],
  [1, 3, 600],
  [3, 6, 800],
  [6, null, 1000],
]);

const LARGE = bands([
  [0, 1, 0],
  [1, 3, 1400],
  [3, 6, 1800],
  [6, null, 2200],
]);

describe('calculateStorageFeeMinor', () => {
  it.each<[string, number, number]>([
    ['same instant', 0, 0],
    ['1 hour', HOURS, 0],
    ['exactly 24h', 24 * HOURS, 0],
    ['24h + 1ms', 24 * HOURS + 1, 600],
    ['2 days', 2 * DAYS, 600],
    ['3 days', 3 * DAYS, 1200],
    ['3.5 days (ceil -> 4)', 3 * DAYS + 12 * HOURS, 2000],
    ['4 days', 4 * DAYS, 2000],
    ['7 days', 7 * DAYS, 4600],
    ['30 days (open-ended tail)', 30 * DAYS, 27_600],
  ])('SMALL, %s -> %d', (_label, durationMs, expected) => {
    expect(calculateStorageFeeMinor(SMALL, T0, after(durationMs))).toBe(
      expected,
    );
  });

  it('applies a different size band table', () => {
    // 0 + 1400*2 + 1800*3 + 2200*1
    expect(calculateStorageFeeMinor(LARGE, T0, after(7 * DAYS))).toBe(10_400);
  });

  it('clamps a retrievedAt before storedAt to zero', () => {
    expect(calculateStorageFeeMinor(SMALL, T0, after(-5 * DAYS))).toBe(0);
  });

  it('throws when the bands do not start at day 0', () => {
    expect(() =>
      calculateStorageFeeMinor(bands([[1, null, 600]]), T0, after(3 * DAYS)),
    ).toThrow(StorageRateConfigError);
  });

  it('throws when there is a gap between bands', () => {
    expect(() =>
      calculateStorageFeeMinor(
        bands([
          [0, 1, 0],
          [3, null, 800],
        ]),
        T0,
        after(5 * DAYS),
      ),
    ).toThrow();
  });
});
