import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DevTokenService } from './shared/auth/dev-token.service.js';
import { ALL_ROLES } from './shared/auth/roles.js';
import { APP_CONFIG, type AppConfiguration } from './shared/config/configuration.js';
import { runMigrations } from './shared/database/migrator.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfiguration>(APP_CONFIG);

  await runMigrations(config.database, new Logger('Migrator'));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (config.authDevTokens) {
    const devTokens = app.get(DevTokenService);
    const logger = new Logger('DevTokens');
    logger.warn('AUTH_DEV_TOKENS is on — issuing unauthenticated role tokens:');
    for (const role of ALL_ROLES) {
      logger.log(`${role.padEnd(8)} ${devTokens.issue(role)}`);
    }
  }

  await app.listen(config.port);
}

await bootstrap();
