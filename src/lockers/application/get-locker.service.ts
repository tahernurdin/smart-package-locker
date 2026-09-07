import { Inject, Injectable } from '@nestjs/common';
import { LockerNotFoundError } from '../domain/errors.js';
import {
  LOCKER_REPOSITORY,
  type LockerRepository,
} from '../domain/locker.repository.js';
import { toLockerView, type LockerView } from './locker.view.js';

@Injectable()
export class GetLockerService {
  constructor(
    @Inject(LOCKER_REPOSITORY) private readonly lockers: LockerRepository,
  ) {}

  async getLocker(id: string): Promise<LockerView> {
    const found = await this.lockers.findByIdWithOccupancy(id);
    if (!found) throw new LockerNotFoundError(id);
    return toLockerView(found);
  }
}
