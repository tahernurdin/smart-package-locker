import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LOCKER_SIZES } from '../../../lockers/domain/locker-size.js';

export class RegisterPackageDto {
  @IsIn(LOCKER_SIZES as readonly string[])
  size!: string;

  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingRef?: string;
}
