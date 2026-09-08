import { IsIn, IsOptional } from 'class-validator';
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

/**
 * The customer's own listing. Note what is absent: there is no `customerId`
 * here, and `forbidNonWhitelisted` turns a request that supplies one into a
 * 400 rather than silently ignoring it. Whose parcels these are comes from the
 * bearer token alone.
 */
export class ListMyPackagesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(PACKAGE_STATUSES as readonly string[])
  status?: PackageStatus;

  @IsOptional()
  @IsIn(LOCKER_SIZES as readonly string[])
  size?: LockerSizeCode;

  @IsOptional()
  @IsIn(PACKAGE_SORT_FIELDS as readonly string[])
  sortBy?: PackageSortField;
}
