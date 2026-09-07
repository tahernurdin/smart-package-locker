import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { APP_CONFIG, type AppConfiguration } from '../config/configuration.js';
import { MYSQL_POOL, createMysqlPool } from './mysql.pool.js';

@Global()
@Module({
  providers: [
    {
      provide: MYSQL_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfiguration) => createMysqlPool(config.database),
    },
  ],
  exports: [MYSQL_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
