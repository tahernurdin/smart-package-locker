import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListStationsQueryDto {
  /** Retired stations are hidden by default; `?includeDecommissioned=true` shows them. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDecommissioned?: boolean;
}
