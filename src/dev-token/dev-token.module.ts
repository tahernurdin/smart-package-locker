import { Module } from '@nestjs/common';
import { AuthModule } from '../shared/auth/auth.module.js';
import { DevTokenService } from './application/dev-token.service.js';
import { DevTokenController } from './interface/dev-token.controller.js';

/**
 * Dev-only scaffolding: the `POST /auth/dev-token` surface and the CLI beside
 * it hand out tokens with no credential check. Nothing in the app depends on
 * this module, so it is deleted whole once real identity exists.
 */
@Module({
  imports: [AuthModule],
  controllers: [DevTokenController],
  providers: [DevTokenService],
  exports: [DevTokenService],
})
export class DevTokenModule {}
