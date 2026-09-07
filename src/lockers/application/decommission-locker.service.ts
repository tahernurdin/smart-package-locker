import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { LockerNotFoundError, LockerOccupiedError } from '../domain/errors.js';
import {
  LOCKER_REPOSITORY,
  type LockerRepository,
} from '../domain/locker.repository.js';
import { toLockerViewAt, type LockerView } from './locker.view.js';

/**
 * Retires a locker. This is what `DELETE /lockers/:id` does: the row stays so
 * the assignment history keeps its referent, the locker drops out of the default
 * listing, and the allocator stops considering it (it only takes IN_SERVICE).
 */
@Injectable()
export class DecommissionLockerService {
  constructor(
    @Inject(LOCKER_REPOSITORY) private readonly lockers: LockerRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async decommissionLocker(id: string): Promise<LockerView> {
    const found = await this.lockers.findByIdWithOccupancy(id);
    if (!found) throw new LockerNotFoundError(id);
    if (found.activePackageId) throw new LockerOccupiedError(id);

    // Throws LockerDecommissionedError if it was already retired.
    const decommissioned = found.locker.decommission(this.clock.now());
    await this.lockers.update(decommissioned);
    return toLockerViewAt(decommissioned, found.station, null);
  }
}
