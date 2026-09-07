import { Global, Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfiguration } from '../config/configuration.js';
import { DevTokenController } from './dev-token.controller.js';
import { DevTokenService } from './dev-token.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfiguration) => ({
        secret: config.jwt.secret,
        signOptions: {
          expiresIn: config.jwt.expiresIn as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [DevTokenController],
  providers: [JwtAuthGuard, RolesGuard, DevTokenService],
  exports: [JwtModule, JwtAuthGuard, RolesGuard, DevTokenService],
})
export class AuthModule {}
