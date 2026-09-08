import { Inject, Injectable } from '@nestjs/common';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import type { StorageRateSchedule } from '../domain/storage-rate-schedule.js';
import {
  STORAGE_RATE_CATALOG,
  type StorageRateCatalog,
} from '../domain/storage-rate.catalog.js';
import type { ListStorageRatesQueryDto } from '../interface/dto/list-storage-rates-query.dto.js';

@Injectable()
export class ListStorageRatesService {
  constructor(
    @Inject(STORAGE_RATE_CATALOG) private readonly catalog: StorageRateCatalog,
  ) {}

  /**
   * Every version, newest first — superseded ones included, since what an
   * operator most often needs is the history a past fee came from.
   */
  async listStorageRates(
    query: ListStorageRatesQueryDto = {},
  ): Promise<StorageRateSchedule[]> {
    return this.catalog.listVersions({
      size: query.sizeCode ? LockerSize.of(query.sizeCode) : undefined,
    });
  }
}
