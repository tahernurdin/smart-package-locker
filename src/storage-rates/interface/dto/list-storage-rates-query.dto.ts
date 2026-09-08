import { IsIn, IsOptional } from 'class-validator';
import {
  LOCKER_SIZES,
  type LockerSizeCode,
} from '../../../lockers/domain/locker-size.js';

export class ListStorageRatesQueryDto {
  /** Restrict to one size; all three when omitted. */
  @IsOptional()
  @IsIn(LOCKER_SIZES as readonly string[])
  sizeCode?: LockerSizeCode;
}
