import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { LockerCodeTakenError, LockerNotFoundError } from '../domain/errors.js';
import {
  LOCKER_REPOSITORY,
  type LockerRepository,
} from '../domain/locker.repository.js';
import type { UpdateLockerDto } from '../interface/dto/update-locker.dto.js';
import { toLockerViewAt, type LockerView } from './locker.view.js';

@Injectable()
export class UpdateLockerService {
  constructor(
    @Inject(LOCKER_REPOSITORY) private readonly lockers: LockerRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async updateLocker(id: string, input: UpdateLockerDto): Promise<LockerView> {
    const found = await this.lockers.findByIdWithOccupancy(id);
    if (!found) throw new LockerNotFoundError(id);
    const { locker, station, activePackageId } = found;

    if (input.code !== undefined) {
      const code = input.code.trim();
      if (
        code !== locker.code &&
        (await this.lockers.existsByStationAndCode(locker.stationId, code))
      ) {
        throw new LockerCodeTakenError(locker.stationId, code);
      }
    }

    // Throws LockerDecommissionedError if the locker is retired.
    const updated = locker.update({
      code: input.code,
      status: input.status,
      now: this.clock.now(),
    });
    // `update` also maps a unique-constraint race to LockerCodeTakenError.
    await this.lockers.update(updated);
    return toLockerViewAt(updated, station, activePackageId);
  }
}
