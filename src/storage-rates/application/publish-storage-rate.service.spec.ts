import { InvalidLockerSizeError } from '../../lockers/domain/errors.js';
import type { LockerSizeCode } from '../../lockers/domain/locker-size.js';
import type { Clock } from '../../shared/clock/clock.js';
import type { IdGenerator } from '../../shared/id/id-generator.js';
import {
  InvalidStorageRateScheduleError,
  StorageRateBackdatedError,
} from '../domain/errors.js';
import type { StorageRateSchedule } from '../domain/storage-rate-schedule.js';
import type { StorageRateCatalog } from '../domain/storage-rate.catalog.js';
import type { PublishStorageRateDto } from '../interface/dto/publish-storage-rate.dto.js';
import { PublishStorageRateService } from './publish-storage-rate.service.js';

const clock: Clock = { now: () => new Date('2026-06-01T12:00:00.000Z') };

const VALID: PublishStorageRateDto = {
  sizeCode: 'SMALL',
  effectiveFrom: '2026-07-01T00:00:00.000Z',
  bands: [
    { fromDay: 0, toDay: 1, rateMinor: 0 },
    { fromDay: 1, toDay: null, rateMinor: 700 },
  ],
};

function build() {
  const published: StorageRateSchedule[] = [];
  const catalog = {
    publish: async (schedule: StorageRateSchedule) => {
      published.push(schedule);
    },
  } as unknown as StorageRateCatalog;
  let n = 0;
  const ids: IdGenerator = { next: () => `band-${++n}` };
  return {
    published,
    service: new PublishStorageRateService(catalog, ids, clock),
  };
}

describe('PublishStorageRateService', () => {
  it('publishes a version with a generated id per band and clock timestamps', async () => {
    const { service, published } = build();

    const schedule = await service.publishStorageRate(VALID);

    expect(schedule.size.code).toBe('SMALL');
    expect(schedule.effectiveFrom.toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
    expect(schedule.entries.map((e) => e.id)).toEqual(['band-1', 'band-2']);
    expect(schedule.createdAt.toISOString()).toBe('2026-06-01T12:00:00.000Z');
    expect(schedule.updatedAt).toEqual(schedule.createdAt);
    expect(published).toEqual([schedule]);
  });

  it('reads an omitted toDay as the open-ended tail', async () => {
    const { service } = build();

    const schedule = await service.publishStorageRate({
      ...VALID,
      bands: [{ fromDay: 0, rateMinor: 500 }],
    });

    expect(schedule.bands[0].toDay).toBeNull();
  });

  it('rejects a backdated version before touching the catalog', async () => {
    const { service, published } = build();

    await expect(
      service.publishStorageRate({
        ...VALID,
        effectiveFrom: '2026-05-01T00:00:00.000Z',
      }),
    ).rejects.toThrow(StorageRateBackdatedError);
    expect(published).toHaveLength(0);
  });

  it('rejects bands that leave a day unpriced before touching the catalog', async () => {
    const { service, published } = build();

    await expect(
      service.publishStorageRate({
        ...VALID,
        bands: [
          { fromDay: 0, toDay: 1, rateMinor: 0 },
          { fromDay: 2, toDay: null, rateMinor: 700 },
        ],
      }),
    ).rejects.toThrow(InvalidStorageRateScheduleError);
    expect(published).toHaveLength(0);
  });

  // The DTO's @IsIn only binds callers that came through the HTTP pipe.
  it('re-checks the size in the domain', async () => {
    const { service } = build();

    await expect(
      service.publishStorageRate({
        ...VALID,
        sizeCode: 'HUGE' as LockerSizeCode,
      }),
    ).rejects.toThrow(InvalidLockerSizeError);
  });
});
