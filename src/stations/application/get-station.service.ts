import { Inject, Injectable } from '@nestjs/common';
import { StationNotFoundError } from '../domain/errors.js';
import type { LockerStation } from '../domain/locker-station.entity.js';
import {
  STATION_REPOSITORY,
  type StationRepository,
} from '../domain/station.repository.js';

@Injectable()
export class GetStationService {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stations: StationRepository,
  ) {}

  async getStation(id: string): Promise<LockerStation> {
    const station = await this.stations.findById(id);
    if (!station) throw new StationNotFoundError(id);
    return station;
  }
}
