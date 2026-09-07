import { Module } from '@nestjs/common';
import { StationsModule } from '../stations/stations.module.js';
import { CreateLockerService } from './application/create-locker.service.js';
import { DecommissionLockerService } from './application/decommission-locker.service.js';
import { GetLockerService } from './application/get-locker.service.js';
import { ListLockersService } from './application/list-lockers.service.js';
import { UpdateLockerService } from './application/update-locker.service.js';
import { LOCKER_REPOSITORY } from './domain/locker.repository.js';
import { MysqlLockerRepository } from './infrastructure/mysql-locker.repository.js';
import { LockersController } from './interface/lockers.controller.js';

@Module({
  // For STATION_REPOSITORY: creating a locker checks its station exists and is live.
  imports: [StationsModule],
  controllers: [LockersController],
  providers: [
    CreateLockerService,
    ListLockersService,
    GetLockerService,
    UpdateLockerService,
    DecommissionLockerService,
    { provide: LOCKER_REPOSITORY, useClass: MysqlLockerRepository },
  ],
  exports: [LOCKER_REPOSITORY],
})
export class LockersModule {}
