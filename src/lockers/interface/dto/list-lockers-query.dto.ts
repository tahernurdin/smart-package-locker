import { IsOptional, IsUUID } from 'class-validator';

export class ListLockersQueryDto {
  @IsOptional()
  @IsUUID()
  stationId?: string;
}
