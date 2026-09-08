import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  LOCKER_SIZES,
  type LockerSizeCode,
} from '../../../lockers/domain/locker-size.js';
import { PaginationQueryDto } from '../../../shared/pagination/pagination-query.dto.js';
import {
  PACKAGE_SORT_FIELDS,
  type PackageSortField,
} from '../../domain/package-sort.js';
import {
  PACKAGE_STATUSES,
  type PackageStatus,
} from '../../domain/package-status.js';

/** The operator's search. Unlike the customer's, it may name any customer. */
export class ListPackagesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsIn(PACKAGE_STATUSES as readonly string[])
  status?: PackageStatus;

  @IsOptional()
  @IsIn(LOCKER_SIZES as readonly string[])
  size?: LockerSizeCode;

  /** Where the parcel sits now, or sat last; never-stored parcels match neither. */
  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @IsUUID()
  lockerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingRef?: string;

  @IsOptional()
  @IsIn(PACKAGE_SORT_FIELDS as readonly string[])
  sortBy?: PackageSortField;
}
