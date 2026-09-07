import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { APP_CONFIG, loadConfiguration } from './configuration.js';

/**
 * Loads `.env` (outside production) and exposes the validated, typed
 * {@link APP_CONFIG} object. Global so every feature module can inject it.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      envFilePath: ['.env'],
    }),
  ],
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfiguration() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
