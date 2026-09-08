import { Global, Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, type AppConfiguration } from '../config/configuration.js';
import {
  REDIS_CLIENT,
  createRedisClient,
  type RedisClient,
} from './redis.client.js';

const logger = new Logger('Redis');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfiguration): RedisClient => {
        const client = createRedisClient(config.redis.url);
        // node-redis emits 'error' on every failed connection attempt, and an
        // unhandled 'error' event takes the process down. Consumers fail open,
        // so an outage belongs in the log, not in the exit code.
        client.on('error', (err: Error) =>
          logger.error(`Redis unavailable: ${err.message}`),
        );
        // Deliberately not awaited: boot does not wait on Redis, and a refused
        // connection must not stop the app from serving. Commands reject while
        // the socket is down (see `disableOfflineQueue`) and start working
        // again once the reconnect strategy lands.
        void client.connect().catch(() => undefined);
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly client: RedisClient) {}

  async onModuleDestroy(): Promise<void> {
    // `close` waits for in-flight replies; if the socket is already gone that
    // wait is pointless, so drop it rather than hang shutdown.
    await this.client.close().catch(() => this.client.destroy());
  }
}
