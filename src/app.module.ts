import { Module } from '@nestjs/common';
import { AuthModule } from './shared/auth/auth.module.js';
import { AppConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { SharedKernelModule } from './shared/shared-kernel.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    SharedKernelModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}
