import { Inject, Injectable } from '@nestjs/common';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../shared/id/id-generator.js';
import { StorageRateSchedule } from '../domain/storage-rate-schedule.js';
import {
  STORAGE_RATE_CATALOG,
  type StorageRateCatalog,
} from '../domain/storage-rate.catalog.js';
import type { PublishStorageRateDto } from '../interface/dto/publish-storage-rate.dto.js';

@Injectable()
export class PublishStorageRateService {
  constructor(
    @Inject(STORAGE_RATE_CATALOG) private readonly catalog: StorageRateCatalog,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async publishStorageRate(
    input: PublishStorageRateDto,
  ): Promise<StorageRateSchedule> {
    // Every rule — a real date, still in the future, bands tiling from day 0 —
    // is checked here before anything is written. The DTO only narrowed shapes.
    const schedule = StorageRateSchedule.publish({
      size: LockerSize.of(input.sizeCode),
      effectiveFrom: new Date(input.effectiveFrom),
      bands: input.bands.map((band) => ({
        fromDay: band.fromDay,
        toDay: band.toDay ?? null,
        rateMinor: band.rateMinor,
      })),
      nextId: () => this.ids.next(),
      now: this.clock.now(),
    });

    // No read-then-write check for an existing version: `publish` maps the
    // unique key to StorageRateVersionExistsError, which also holds under a
    // concurrent publish of the same instant.
    await this.catalog.publish(schedule);
    return schedule;
  }
}
