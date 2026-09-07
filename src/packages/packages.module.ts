import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module.js';
import { LockersModule } from '../lockers/lockers.module.js';
import { RetrievePackageService } from './application/retrieve-package.service.js';
import { StorePackageService } from './application/store-package.service.js';
import { PACKAGE_REPOSITORY } from './domain/package.repository.js';
import { STORAGE_FEE_POLICY } from './domain/storage-fee.policy.js';
import { FlatZeroStorageFeePolicy } from './infrastructure/flat-zero-storage-fee.policy.js';
import { MysqlPackageRepository } from './infrastructure/mysql-package.repository.js';
import { PackagesController } from './interface/packages.controller.js';

@Module({
  imports: [LockersModule, CustomersModule],
  controllers: [PackagesController],
  providers: [
    StorePackageService,
    RetrievePackageService,
    { provide: PACKAGE_REPOSITORY, useClass: MysqlPackageRepository },
    { provide: STORAGE_FEE_POLICY, useClass: FlatZeroStorageFeePolicy },
  ],
})
export class PackagesModule {}
