import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id/id-generator.js';
import { LockerCodeTakenError } from '../domain/errors.js';
import { Locker } from '../domain/locker.entity.js';
import { LockerSize } from '../domain/locker-size.js';
import {
  LOCKER_REPOSITORY,
  type LockerRepository,
} from '../domain/locker.repository.js';

/** The single seeded station (migrations/002_seed.sql). A valid v4 UUID so it
 *  passes `@IsUUID()` when a client passes it explicitly. */
export const DEFAULT_STATION_ID = '00000000-0000-4000-8000-000000000000';

export interface CreateLockerInput {
  code: string;
  size: string;
  stationId?: string;
}

@Injectable()
export class CreateLockerService {
  constructor(
    @Inject(LOCKER_REPOSITORY) private readonly lockers: LockerRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createLocker(input: CreateLockerInput): Promise<Locker> {
    const stationId = input.stationId ?? DEFAULT_STATION_ID;
    const size = LockerSize.of(input.size);
    const code = input.code.trim();

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
    return locker;
  }
}
