import { Module } from '@nestjs/common';
import { LockersModule } from '../lockers/lockers.module.js';
import { StationsModule } from '../stations/stations.module.js';
import { StorageRatesModule } from '../storage-rates/storage-rates.module.js';
import { RegisterPackageService } from './application/register-package.service.js';
import { RetrievePackageService } from './application/retrieve-package.service.js';
import { StorePackageService } from './application/store-package.service.js';
import { PACKAGE_REPOSITORY } from './domain/package.repository.js';
import { STORAGE_FEE_POLICY } from './domain/storage-fee.policy.js';
import { MysqlPackageRepository } from './infrastructure/mysql-package.repository.js';
import { TieredStorageFeePolicy } from './infrastructure/tiered-storage-fee.policy.js';
import { PackagesController } from './interface/packages.controller.js';

@Module({
  // StationsModule for STATION_REPOSITORY: storing validates the station the
  // agent names. StorageRatesModule for STORAGE_RATE_REPOSITORY: the fee policy
  // prices a stay from the rate posted when the package was stored, while the
  // operator publishes those rates over there. The graph stays acyclic —
  // packages → {lockers → stations, storage-rates}.
  imports: [LockersModule, StationsModule, StorageRatesModule],
  controllers: [PackagesController],
  providers: [
    RegisterPackageService,
    StorePackageService,
    RetrievePackageService,
    { provide: PACKAGE_REPOSITORY, useClass: MysqlPackageRepository },
    { provide: STORAGE_FEE_POLICY, useClass: TieredStorageFeePolicy },
  ],
})
export class PackagesModule {}
