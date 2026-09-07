import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { LOCKER_SIZES } from '../../../lockers/domain/locker-size.js';

class CustomerInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class StorePackageDto {
  @IsIn(LOCKER_SIZES as readonly string[])
  size!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CustomerInputDto)
  customer!: CustomerInputDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingRef?: string;
}
