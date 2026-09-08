import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto.js';
import {
  LOCKER_AVAILABILITIES,
  type LockerAvailability,
} from '../../domain/locker-availability.js';
import { LOCKER_SIZES, type LockerSizeCode } from '../../domain/locker-size.js';
import {
  LOCKER_SORT_FIELDS,
  type LockerSortField,
} from '../../domain/locker-sort.js';
import {
  LOCKER_STATUSES,
  type LockerStatus,
} from '../../domain/locker-status.js';

/** `?limit=&offset=&sortBy=&sortDir=` come from {@link PaginationQueryDto}. */
export class ListLockersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @IsIn(LOCKER_SIZES as readonly string[])
  size?: LockerSizeCode;

  @IsOptional()
  @IsIn(LOCKER_STATUSES as readonly string[])
  status?: LockerStatus;

  /** Whether the locker holds a package right now. */
  @IsOptional()
  @IsIn(LOCKER_AVAILABILITIES as readonly string[])
  availability?: LockerAvailability;

  /**
   * Retired lockers are hidden by default; `?includeDecommissioned=true` shows
   * them, and so does asking for `?status=DECOMMISSIONED` outright.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDecommissioned?: boolean;

  @IsOptional()
  @IsIn(LOCKER_SORT_FIELDS as readonly string[])
  sortBy?: LockerSortField;
}
