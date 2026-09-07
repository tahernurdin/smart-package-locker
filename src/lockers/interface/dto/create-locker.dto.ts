import { IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { LOCKER_SIZES, type LockerSizeCode } from '../../domain/locker-size.js';

export class CreateLockerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code!: string;

  @IsIn(LOCKER_SIZES as readonly string[])
  size!: LockerSizeCode;

  /**
   * Required: a locker is always created *at* a named station. There is no
   * implicit default — create the station first (`POST /stations`) or list the
   * existing ones (`GET /stations`).
   */
  @IsUUID()
  stationId!: string;
}
