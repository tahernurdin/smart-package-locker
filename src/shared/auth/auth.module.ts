import { Global, Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfiguration } from '../config/configuration.js';
import { BearerAuthGuard } from './bearer-auth.guard.js';
import { JwtTokenVerifier } from './jwt-token-verifier.js';
import { RolesGuard } from './roles.guard.js';
import { TOKEN_VERIFIER } from './token-verifier.js';

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
  providers: [
    { provide: TOKEN_VERIFIER, useClass: JwtTokenVerifier },
    BearerAuthGuard,
    RolesGuard,
  ],
  exports: [JwtModule, TOKEN_VERIFIER, BearerAuthGuard, RolesGuard],
})
export class AuthModule {}
