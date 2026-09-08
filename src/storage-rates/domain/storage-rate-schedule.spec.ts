import { LockerSize } from '../../lockers/domain/locker-size.js';
import {
  InvalidStorageRateBandError,
  InvalidStorageRateScheduleError,
  StorageRateBackdatedError,
} from './errors.js';
import { StorageRateBand } from './storage-rate.js';
import {
  StorageRateSchedule,
  type StorageRateBandInput,
} from './storage-rate-schedule.js';

const SMALL = LockerSize.of('SMALL');
const NOW = new Date('2026-06-01T12:00:00.000Z');
const NEXT_MONTH = new Date('2026-07-01T00:00:00.000Z');

const TILING: StorageRateBandInput[] = [
  { fromDay: 0, toDay: 1, rateMinor: 0 },
  { fromDay: 1, toDay: 3, rateMinor: 600 },
  { fromDay: 3, toDay: null, rateMinor: 900 },
];

function publish(
  bands: StorageRateBandInput[],
  effectiveFrom = NEXT_MONTH,
): StorageRateSchedule {
  let n = 0;
  return StorageRateSchedule.publish({
    size: SMALL,
    effectiveFrom,
    bands,
    nextId: () => `band-${++n}`,
    now: NOW,
  });
}

describe('StorageRateSchedule.publish', () => {
  it('keeps the bands in fromDay order, one id each, stamped with the clock', () => {
    const schedule = publish(TILING);

    expect(schedule.size).toBe(SMALL);
    expect(schedule.effectiveFrom).toEqual(NEXT_MONTH);
    expect(schedule.entries.map((e) => e.id)).toEqual([
      'band-1',
      'band-2',
      'band-3',
    ]);
    expect(
      schedule.bands.map((b) => [b.fromDay, b.toDay, b.rateMinor]),
    ).toEqual([
      [0, 1, 0],
      [1, 3, 600],
      [3, null, 900],
    ]);
    expect(schedule.createdAt).toEqual(NOW);
    expect(schedule.updatedAt).toEqual(schedule.createdAt);
  });

  it('accepts bands submitted out of order', () => {
    const schedule = publish([TILING[2], TILING[0], TILING[1]]);
    expect(schedule.bands.map((b) => b.fromDay)).toEqual([0, 1, 3]);
  });

  it('rejects an empty band list', () => {
    expect(() => publish([])).toThrow(InvalidStorageRateScheduleError);
  });

  it('rejects bands that do not start at day 0', () => {
    expect(() =>
      publish([
        { fromDay: 1, toDay: 3, rateMinor: 600 },
        { fromDay: 3, toDay: null, rateMinor: 900 },
      ]),
    ).toThrow(InvalidStorageRateScheduleError);
  });

  it('rejects a gap between bands', () => {
    expect(() =>
      publish([
        { fromDay: 0, toDay: 1, rateMinor: 0 },
        { fromDay: 2, toDay: null, rateMinor: 900 },
      ]),
    ).toThrow(/contiguous/);
  });

  it('rejects overlapping bands', () => {
    expect(() =>
      publish([
        { fromDay: 0, toDay: 3, rateMinor: 0 },
        { fromDay: 1, toDay: null, rateMinor: 900 },
      ]),
    ).toThrow(/contiguous/);
  });

  it('rejects two bands starting on the same day', () => {
    expect(() =>
      publish([
        { fromDay: 0, toDay: 1, rateMinor: 0 },
        { fromDay: 0, toDay: null, rateMinor: 900 },
      ]),
    ).toThrow(/contiguous/);
  });

  // The remaining overlap shapes. Contiguity catches them all because it
  // demands an exact edge match, not merely the absence of an overlap — worth
  // pinning, since relaxing it to a `>` comparison would let these through.
  it('rejects a band wholly containing the ones after it', () => {
    expect(() =>
      publish([
        { fromDay: 0, toDay: 10, rateMinor: 0 },
        { fromDay: 1, toDay: 2, rateMinor: 600 },
        { fromDay: 2, toDay: null, rateMinor: 900 },
      ]),
    ).toThrow(/contiguous/);
  });

  it('rejects an overlap that only starts partway down the list', () => {
    expect(() =>
      publish([
        { fromDay: 0, toDay: 1, rateMinor: 0 },
        { fromDay: 1, toDay: 5, rateMinor: 600 },
        { fromDay: 2, toDay: null, rateMinor: 900 },
      ]),
    ).toThrow(/contiguous/);
  });

  it('rejects a second open-ended tail overlapping the first', () => {
    expect(() =>
      publish([
        { fromDay: 0, toDay: 1, rateMinor: 0 },
        { fromDay: 1, toDay: null, rateMinor: 600 },
        { fromDay: 4, toDay: null, rateMinor: 900 },
      ]),
    ).toThrow(/contiguous/);
  });

  it('rejects a schedule with no open-ended tail', () => {
    expect(() =>
      publish([
        { fromDay: 0, toDay: 1, rateMinor: 0 },
        { fromDay: 1, toDay: 3, rateMinor: 900 },
      ]),
    ).toThrow(/open-ended/);
  });

  it('rejects an open-ended band that is not last', () => {
    expect(() =>
      publish([
        { fromDay: 0, toDay: null, rateMinor: 0 },
        { fromDay: 1, toDay: 3, rateMinor: 900 },
      ]),
    ).toThrow(InvalidStorageRateScheduleError);
  });

  it('rejects a backdated version — a past rate priced packages already stored', () => {
    expect(() => publish(TILING, new Date('2026-05-01T00:00:00.000Z'))).toThrow(
      StorageRateBackdatedError,
    );
  });

  it('rejects a version effective at this very instant', () => {
    expect(() => publish(TILING, NOW)).toThrow(StorageRateBackdatedError);
  });

  it('rejects an unparseable effectiveFrom', () => {
    expect(() => publish(TILING, new Date('not-a-date'))).toThrow(
      InvalidStorageRateScheduleError,
    );
  });

  it('surfaces a bad band before any schedule-level rule', () => {
    expect(() => publish([{ fromDay: 0, toDay: 0, rateMinor: 0 }])).toThrow(
      InvalidStorageRateBandError,
    );
  });
});

describe('StorageRateSchedule.fromPersistence', () => {
  it('rehydrates a version whose bands do not tile, so a bad one stays listable', () => {
    const schedule = StorageRateSchedule.fromPersistence({
      size: SMALL,
      effectiveFrom: NEXT_MONTH,
      entries: [
        {
          id: 'band-1',
          band: StorageRateBand.of({ fromDay: 4, toDay: 6, rateMinor: 100 }),
        },
      ],
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(schedule.bands.map((b) => b.fromDay)).toEqual([4]);
  });
});
