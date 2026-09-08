import { Module } from '@nestjs/common';
import { ListStorageRatesService } from './application/list-storage-rates.service.js';
import { PublishStorageRateService } from './application/publish-storage-rate.service.js';
import { STORAGE_RATE_CATALOG } from './domain/storage-rate.catalog.js';
import { STORAGE_RATE_REPOSITORY } from './domain/storage-rate.repository.js';
import { MysqlStorageRateRepository } from './infrastructure/mysql-storage-rate.repository.js';
import { StorageRatesController } from './interface/storage-rates.controller.js';

@Module({
  controllers: [StorageRatesController],
  providers: [
    PublishStorageRateService,
    ListStorageRatesService,
    // One adapter behind both ports — `useExisting` so they share an instance
    // rather than opening two of the same thing over the pool.
    MysqlStorageRateRepository,
    {
      provide: STORAGE_RATE_REPOSITORY,
      useExisting: MysqlStorageRateRepository,
    },
    { provide: STORAGE_RATE_CATALOG, useExisting: MysqlStorageRateRepository },
  ],
  // PackagesModule needs the read port: the fee policy prices a stay from the
  // rate effective when the package was stored.
  exports: [STORAGE_RATE_REPOSITORY],
})
export class StorageRatesModule {}
