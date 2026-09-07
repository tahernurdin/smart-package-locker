import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LOCKER_SIZES } from '../../../lockers/domain/locker-size.js';

export class RegisterPackageDto {
  @IsIn(LOCKER_SIZES as readonly string[])
  size!: string;

  // Reference to a customer owned by an upstream customer service; assumed to be
  // a UUID it issues. Persisted as-is, never resolved against a local table.
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingRef?: string;
}
