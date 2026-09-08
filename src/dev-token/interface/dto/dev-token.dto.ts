import { IsIn, IsOptional, IsString } from 'class-validator';
import { ALL_ROLES, type Role } from '../../../shared/auth/roles.js';

export class DevTokenDto {
  @IsIn(ALL_ROLES as readonly string[])
  role!: Role;

  @IsOptional()
  @IsString()
  sub?: string;
}
