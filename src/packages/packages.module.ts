import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module.js';
import { LockersModule } from '../lockers/lockers.module.js';
import { StorePackageService } from './application/store-package.service.js';
import { PACKAGE_REPOSITORY } from './domain/package.repository.js';
import { MysqlPackageRepository } from './infrastructure/mysql-package.repository.js';
import { PackagesController } from './interface/packages.controller.js';

@Module({
  imports: [LockersModule, CustomersModule],
  controllers: [PackagesController],
  providers: [
    StorePackageService,
    { provide: PACKAGE_REPOSITORY, useClass: MysqlPackageRepository },
  ],
})
export class PackagesModule {}
