import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [AppConfigModule, HealthModule],
})
export class AppModule {}
