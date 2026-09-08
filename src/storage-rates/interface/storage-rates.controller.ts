import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type { LockerSizeCode } from '../../lockers/domain/locker-size.js';
import { Auth } from '../../shared/auth/auth.decorator.js';
import { Role } from '../../shared/auth/roles.js';
import { ListStorageRatesService } from '../application/list-storage-rates.service.js';
import { PublishStorageRateService } from '../application/publish-storage-rate.service.js';
import type { StorageRateSchedule } from '../domain/storage-rate-schedule.js';
import { ListStorageRatesQueryDto } from './dto/list-storage-rates-query.dto.js';
import { PublishStorageRateDto } from './dto/publish-storage-rate.dto.js';

export interface StorageRateBandView {
  fromDay: number;
  toDay: number | null;
  rateMinor: number;
}

export interface StorageRateVersionView {
  sizeCode: LockerSizeCode;
  effectiveFrom: string;
  bands: StorageRateBandView[];
  createdAt: string;
  updatedAt: string;
}

function toView(schedule: StorageRateSchedule): StorageRateVersionView {
  return {
    sizeCode: schedule.size.code,
    effectiveFrom: schedule.effectiveFrom.toISOString(),
    // Band row ids stay internal: a version is immutable, so there is nothing a
    // client could address one of them for.
    bands: schedule.bands.map((band) => ({
      fromDay: band.fromDay,
      toDay: band.toDay,
      rateMinor: band.rateMinor,
    })),
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

/**
 * Operator pricing. Publish-only by design — no PATCH, no DELETE: a fee is
 * recomputed at retrieval from the version effective when the package was
 * stored, so editing a published version would rewrite what a customer was
 * already charged. Change a price by publishing a new version.
 */
@Controller('storage-rates')
@Auth(Role.Operator)
export class StorageRatesController {
  constructor(
    private readonly publishStorageRate: PublishStorageRateService,
    private readonly listStorageRates: ListStorageRatesService,
  ) {}

  @Post()
  @HttpCode(201)
  async publish(
    @Body() dto: PublishStorageRateDto,
  ): Promise<StorageRateVersionView> {
    return toView(await this.publishStorageRate.publishStorageRate(dto));
  }

  @Get()
  async list(
    @Query() query: ListStorageRatesQueryDto,
  ): Promise<StorageRateVersionView[]> {
    return (await this.listStorageRates.listStorageRates(query)).map(toView);
  }
}
