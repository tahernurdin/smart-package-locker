import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ListLockersQueryDto {
  @IsOptional()
  @IsUUID()
  stationId?: string;

  /** Retired lockers are hidden by default; `?includeDecommissioned=true` shows them. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDecommissioned?: boolean;
}
