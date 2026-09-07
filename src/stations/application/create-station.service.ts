import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../shared/id/id-generator.js';
import { LockerStation } from '../domain/locker-station.entity.js';
import {
  STATION_REPOSITORY,
  type StationRepository,
} from '../domain/station.repository.js';

export interface CreateStationInput {
  name: string;
  location?: string | null;
}

@Injectable()
export class CreateStationService {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stations: StationRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createStation(input: CreateStationInput): Promise<LockerStation> {
    const station = LockerStation.create({
      id: this.ids.next(),
      name: input.name,
      location: input.location,
      now: this.clock.now(),
    });
    await this.stations.save(station);
    return station;
  }
}
