import { Module } from '@nestjs/common';
import { CreateStationService } from './application/create-station.service.js';
import { DecommissionStationService } from './application/decommission-station.service.js';
import { GetStationService } from './application/get-station.service.js';
import { ListStationsService } from './application/list-stations.service.js';
import { UpdateStationService } from './application/update-station.service.js';
import { STATION_REPOSITORY } from './domain/station.repository.js';
import { MysqlStationRepository } from './infrastructure/mysql-station.repository.js';
import { StationsController } from './interface/stations.controller.js';

@Module({
  controllers: [StationsController],
  providers: [
    CreateStationService,
    ListStationsService,
    GetStationService,
    UpdateStationService,
    DecommissionStationService,
    { provide: STATION_REPOSITORY, useClass: MysqlStationRepository },
  ],
  // LockersModule needs it: a locker is created *at* a station, so creation
  // checks the station exists and is live.
  exports: [STATION_REPOSITORY],
})
export class StationsModule {}
