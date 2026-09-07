import { Inject, Injectable } from '@nestjs/common';
import type { LockerSizeCode } from '../domain/locker-size.js';
import type { LockerStatus } from '../domain/locker-status.js';
import {
  LOCKER_REPOSITORY,
  type LockerRepository,
} from '../domain/locker.repository.js';

export interface LockerView {
  id: string;
  code: string;
  size: LockerSizeCode;
  status: LockerStatus;
  availability: 'FREE' | 'OCCUPIED';
  activePackageId: string | null;
}

@Injectable()
export class ListLockersService {
  constructor(
    @Inject(LOCKER_REPOSITORY) private readonly lockers: LockerRepository,
  ) {}

  async listLockers(): Promise<LockerView[]> {
    const rows = await this.lockers.listWithOccupancy();
    return rows.map(({ locker, activePackageId }) => ({
      id: locker.id,
      code: locker.code,
      size: locker.size.code,
      status: locker.status,
      availability: activePackageId ? 'OCCUPIED' : 'FREE',
      activePackageId,
    }));
  }
}
