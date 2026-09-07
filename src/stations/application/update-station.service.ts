import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { StationNotFoundError } from '../domain/errors.js';
import type { LockerStation } from '../domain/locker-station.entity.js';
import type { UpdateStationDto } from '../interface/dto/update-station.dto.js';
import {
  STATION_REPOSITORY,
  type StationRepository,
} from '../domain/station.repository.js';

@Injectable()
export class UpdateStationService {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stations: StationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async updateStation(
    id: string,
    input: UpdateStationDto,
  ): Promise<LockerStation> {
    const station = await this.stations.findById(id);
    if (!station) throw new StationNotFoundError(id);

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
