import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import {
  StationNotEmptyError,
  StationNotFoundError,
} from '../domain/errors.js';
import type { LockerStation } from '../domain/locker-station.entity.js';
import {
  STATION_REPOSITORY,
  type StationRepository,
} from '../domain/station.repository.js';

/**
 * Retires a station. This is what `DELETE /stations/:id` does: the row stays so
 * the lockers (and their assignment history) keep their referent, and the
 * station drops out of the default listing and refuses new lockers.
 */
@Injectable()
export class DecommissionStationService {
  constructor(
    @Inject(STATION_REPOSITORY) private readonly stations: StationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async decommissionStation(id: string): Promise<LockerStation> {
    const station = await this.stations.findById(id);
    if (!station) throw new StationNotFoundError(id);

    const liveLockers = await this.stations.countLiveLockers(id);
    if (liveLockers > 0) throw new StationNotEmptyError(id, liveLockers);

    // Throws StationDecommissionedError if it was already retired.
    const decommissioned = station.decommission(this.clock.now());
    await this.stations.update(decommissioned);
    return decommissioned;
  }
}
