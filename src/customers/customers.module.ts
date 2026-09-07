import { Module } from '@nestjs/common';
import { FindOrCreateCustomerService } from './application/find-or-create-customer.service.js';
import { CUSTOMER_REPOSITORY } from './domain/customer.repository.js';
import { MysqlCustomerRepository } from './infrastructure/mysql-customer.repository.js';
import { CustomersController } from './interface/customers.controller.js';

@Module({
  controllers: [CustomersController],
  providers: [
    FindOrCreateCustomerService,
    { provide: CUSTOMER_REPOSITORY, useClass: MysqlCustomerRepository },
  ],
  exports: [FindOrCreateCustomerService, CUSTOMER_REPOSITORY],
})
export class CustomersModule {}
