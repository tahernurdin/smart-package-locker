import { Inject, Injectable } from '@nestjs/common';
import type { LockerStation } from '../domain/locker-station.entity.js';
import {
  STATION_REPOSITORY,
  type ListStationsFilter,
  type StationRepository,
} from '../domain/station.repository.js';

@Injectable()
export class ListStationsService {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stations: StationRepository,
  ) {}

  listStations(filter: ListStationsFilter = {}): Promise<LockerStation[]> {
    return this.stations.list(filter);
  }
}
