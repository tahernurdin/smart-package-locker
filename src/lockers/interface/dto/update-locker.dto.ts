import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  LIVE_LOCKER_STATUSES,
  type LiveLockerStatus,
} from '../../domain/locker-status.js';

/**
 * Send only what changes. `size` and `stationId` are absent by design: they
 * describe the hardware and where it is bolted, so a box that outgrew its label
 * is retired (`DELETE`) and replaced rather than edited.
 *
 * `status` accepts only the live statuses — DECOMMISSIONED is reached through
 * `DELETE /lockers/:id`, which enforces that the locker is empty first.
 */
export class UpdateLockerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @IsIn(LIVE_LOCKER_STATUSES as readonly string[])
  status?: LiveLockerStatus;
}
