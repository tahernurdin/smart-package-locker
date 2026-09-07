import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../shared/id/id-generator.js';
// A locker is created *at* a station, so this context depends on the stations
// one — the same direction as `packages` depending on `LockerSize` here.
import {
  StationDecommissionedError,
  StationNotFoundError,
} from '../../stations/domain/errors.js';
import {
  STATION_REPOSITORY,
  type StationRepository,
} from '../../stations/domain/station.repository.js';
import { LockerCodeTakenError } from '../domain/errors.js';
import { Locker } from '../domain/locker.entity.js';
import { LockerSize } from '../domain/locker-size.js';
import {
  LOCKER_REPOSITORY,
  type LockerRepository,
} from '../domain/locker.repository.js';
import type { CreateLockerDto } from '../interface/dto/create-locker.dto.js';
import { toLockerViewAt, type LockerView } from './locker.view.js';

@Injectable()
export class CreateLockerService {
  constructor(
    @Inject(LOCKER_REPOSITORY) private readonly lockers: LockerRepository,
    @Inject(STATION_REPOSITORY) private readonly stations: StationRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createLocker(input: CreateLockerDto): Promise<LockerView> {
    const { stationId } = input;
    const size = LockerSize.of(input.size);
    const code = input.code.trim();

    // Without this an unknown stationId would reach the FK and surface as a 500.
    const station = await this.stations.findById(stationId);
    if (!station) throw new StationNotFoundError(stationId);
    if (!station.isActive()) throw new StationDecommissionedError(stationId);

    if (await this.lockers.existsByStationAndCode(stationId, code)) {
      throw new LockerCodeTakenError(stationId, code);
    }

    const locker = Locker.create({
      id: this.ids.next(),
      stationId,
      code,
      size,
      now: this.clock.now(),
    });
    // `save` also maps a unique-constraint race to LockerCodeTakenError.
    await this.lockers.save(locker);
    return toLockerViewAt(locker, station, null);
  }
}
