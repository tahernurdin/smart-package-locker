import { Module } from '@nestjs/common';
import { FindOrCreateCustomerService } from './application/find-or-create-customer.service.js';
import { CUSTOMER_REPOSITORY } from './domain/customer.repository.js';
import { MysqlCustomerRepository } from './infrastructure/mysql-customer.repository.js';

@Module({
  providers: [
    FindOrCreateCustomerService,
    { provide: CUSTOMER_REPOSITORY, useClass: MysqlCustomerRepository },
  ],
  exports: [FindOrCreateCustomerService],
})
export class CustomersModule {}
