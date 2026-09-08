import {
  Body,
  Controller,
  Inject,
  NotFoundException,
  Post,
} from '@nestjs/common';
import type { Role } from '../../shared/auth/roles.js';
import {
  APP_CONFIG,
  type AppConfiguration,
} from '../../shared/config/configuration.js';
import { DevTokenService } from '../application/dev-token.service.js';
import { DevTokenDto } from './dto/dev-token.dto.js';

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
