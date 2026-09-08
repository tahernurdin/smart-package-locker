import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  LOCKER_SIZES,
  type LockerSizeCode,
} from '../../../lockers/domain/locker-size.js';

export class StorageRateBandDto {
  @IsInt()
  @Min(0)
  fromDay!: number;

  /** Omitted or null is the open-ended tail; exactly one band may be, and it is the last. */
  @IsOptional()
  @IsInt()
  @Min(1)
  toDay?: number | null;

  @IsInt()
  @Min(0)
  rateMinor!: number;
}

/**
 * A whole new version of one size's prices. There is no endpoint to edit a band:
 * publishing supersedes, it never rewrites, so a fee already charged stays
 * reproducible.
 */
export class PublishStorageRateDto {
  @IsIn(LOCKER_SIZES as readonly string[])
  sizeCode!: LockerSizeCode;

  /** When this version starts applying. Must be in the future — rates are forward-only. */
  @IsISO8601()
  effectiveFrom!: string;

  /** Must tile `[0, ∞)`: start at day 0, meet at the edges, end open-ended. */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StorageRateBandDto)
  bands!: StorageRateBandDto[];
}
