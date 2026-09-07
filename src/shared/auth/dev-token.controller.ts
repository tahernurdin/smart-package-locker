import {
  Body,
  Controller,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { APP_CONFIG, type AppConfiguration } from '../config/configuration.js';
import { DevTokenService } from './dev-token.service.js';
import { ALL_ROLES, type Role } from './roles.js';

class DevTokenDto {
  @IsIn(ALL_ROLES as readonly string[])
  role!: Role;

  @IsOptional()
  @IsString()
  sub?: string;
}

/**
 * Dev-only helper to mint a token per role. Every route 404s unless
 * `AUTH_DEV_TOKENS` is enabled.
 */
@Controller('auth')
export class DevTokenController {
  constructor(
    private readonly devTokens: DevTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfiguration,
  ) {}

  @Post('dev-token')
  issue(@Body() dto: DevTokenDto): { token: string; role: Role } {
    if (!this.config.authDevTokens) throw new NotFoundException();
    return { token: this.devTokens.issue(dto.role, dto.sub), role: dto.role };
  }
}
