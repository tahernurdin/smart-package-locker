import { Module } from '@nestjs/common';
import { AuthModule } from './shared/auth/auth.module.js';
import { AppConfigModule } from './shared/config/config.module.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { SharedKernelModule } from './shared/shared-kernel.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { HealthModule } from './health/health.module.js';
import { LockersModule } from './lockers/lockers.module.js';
import { PackagesModule } from './packages/packages.module.js';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    SharedKernelModule,
    AuthModule,
    HealthModule,
    LockersModule,
    CustomersModule,
    PackagesModule,
  ],
})
export class AppModule {}
