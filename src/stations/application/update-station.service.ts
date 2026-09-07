import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { StationNotFoundError } from '../domain/errors.js';
import type { LockerStation } from '../domain/locker-station.entity.js';
import {
  STATION_REPOSITORY,
  type StationRepository,
} from '../domain/station.repository.js';

export interface UpdateStationInput {
  id: string;
  name?: string;
  location?: string | null;
}

@Injectable()
export class UpdateStationService {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stations: StationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async updateStation(input: UpdateStationInput): Promise<LockerStation> {
    const station = await this.stations.findById(input.id);
    if (!station) throw new StationNotFoundError(input.id);

    // Throws StationDecommissionedError if the station is retired.
    const updated = station.update({
      name: input.name,
      location: input.location,
      now: this.clock.now(),
    });
    await this.stations.update(updated);
    return updated;
  }
}
