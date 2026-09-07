import { Module } from '@nestjs/common';
import { CreateLockerService } from './application/create-locker.service.js';
import { ListLockersService } from './application/list-lockers.service.js';
import { LOCKER_REPOSITORY } from './domain/locker.repository.js';
import { MysqlLockerRepository } from './infrastructure/mysql-locker.repository.js';
import { LockersController } from './interface/lockers.controller.js';

@Module({
  controllers: [LockersController],
  providers: [
    CreateLockerService,
    ListLockersService,
    { provide: LOCKER_REPOSITORY, useClass: MysqlLockerRepository },
  ],
  exports: [LOCKER_REPOSITORY],
})
export class LockersModule {}
