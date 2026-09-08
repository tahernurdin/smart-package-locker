import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_PAGE_LIMIT } from './page.js';
import { SORT_DIRECTIONS, type SortDirection } from './sort.js';

/**
 * The `?limit=&offset=&sortDir=` every list endpoint accepts. Extend it and add
 * the feature's own filters plus a `sortBy` narrowed to its sortable fields.
 *
 * Omitted values stay `undefined` here rather than defaulting: the default page
 * size is the service's to apply, so a service called directly gets it too.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsIn(SORT_DIRECTIONS as readonly string[])
  sortDir?: SortDirection;
}
