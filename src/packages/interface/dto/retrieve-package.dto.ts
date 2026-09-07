import { IsUUID, Matches } from 'class-validator';

export class RetrievePackageDto {
  @IsUUID()
  lockerId!: string;

  @Matches(/^\d{6}$/, { message: 'pickupCode must be exactly 6 digits' })
  pickupCode!: string;
}
