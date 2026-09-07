import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module.js';
import { LockersModule } from '../lockers/lockers.module.js';
import { RegisterPackageService } from './application/register-package.service.js';
import { RetrievePackageService } from './application/retrieve-package.service.js';
import { StorePackageService } from './application/store-package.service.js';
import { PACKAGE_REPOSITORY } from './domain/package.repository.js';
import { STORAGE_FEE_POLICY } from './domain/storage-fee.policy.js';
import { STORAGE_RATE_REPOSITORY } from './domain/storage-rate.repository.js';
import { MysqlPackageRepository } from './infrastructure/mysql-package.repository.js';
import { MysqlStorageRateRepository } from './infrastructure/mysql-storage-rate.repository.js';
import { TieredStorageFeePolicy } from './infrastructure/tiered-storage-fee.policy.js';
import { PackagesController } from './interface/packages.controller.js';

@Module({
  imports: [LockersModule, CustomersModule],
  controllers: [PackagesController],
  providers: [
    RegisterPackageService,
    StorePackageService,
    RetrievePackageService,
    { provide: PACKAGE_REPOSITORY, useClass: MysqlPackageRepository },
    { provide: STORAGE_RATE_REPOSITORY, useClass: MysqlStorageRateRepository },
    { provide: STORAGE_FEE_POLICY, useClass: TieredStorageFeePolicy },
  ],
})
export class PackagesModule {}
