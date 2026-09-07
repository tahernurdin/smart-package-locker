import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { LOCKER_SIZES, type LockerSizeCode } from '../../domain/locker-size.js';

export class CreateLockerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @IsIn(LOCKER_SIZES as readonly string[])
  size!: LockerSizeCode;

  @IsOptional()
  @IsUUID()
  stationId?: string;
}
