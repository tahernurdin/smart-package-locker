import { Inject, Injectable } from '@nestjs/common';
import {
  resolvePageRequest,
  toPage,
  type Page,
} from '../../shared/pagination/page.js';
import { LockerSize } from '../domain/locker-size.js';
import { lockerSortOf } from '../domain/locker-sort.js';
import {
  LOCKER_REPOSITORY,
  type ListLockersFilter,
  type LockerRepository,
} from '../domain/locker.repository.js';
import type { ListLockersQueryDto } from '../interface/dto/list-lockers-query.dto.js';
import { toLockerView, type LockerView } from './locker.view.js';

export type { LockerView };

@Injectable()
export class ListLockersService {
  constructor(
    @Inject(LOCKER_REPOSITORY) private readonly lockers: LockerRepository,
  ) {}

  async listLockers(
    query: ListLockersQueryDto = {},
  ): Promise<Page<LockerView>> {
    // The window and the sort are resolved here, not in the adapter, so every
    // caller — HTTP or not — gets the same defaults and the same ceiling.
    const page = resolvePageRequest(query);
    const { rows, total } = await this.lockers.listWithOccupancy({
      filter: toFilter(query),
      sort: lockerSortOf(query.sortBy, query.sortDir),
      page,
    });
    return toPage(rows.map(toLockerView), total, page);
  }
}

function toFilter(query: ListLockersQueryDto): ListLockersFilter {
  return {
    stationId: query.stationId,
    // `LockerSize.of` re-checks a size the DTO only claims to have narrowed.
    size: query.size ? LockerSize.of(query.size) : undefined,
    status: query.status,
    availability: query.availability,
    includeDecommissioned: query.includeDecommissioned,
  };
}
