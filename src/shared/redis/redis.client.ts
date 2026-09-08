import { createClient } from 'redis';
import { ATTEMPT_COUNTER_SCRIPTS } from './attempt-counter.scripts.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * The one Redis client for the app. Everything it currently backs (the pickup
 * attempt limiter) fails open, so the client is tuned to *report* an outage
 * quickly rather than to paper over one:
 *
 * - `disableOfflineQueue` makes commands reject the moment the socket is down
 *   instead of queueing until it returns. A queued command would hang the
 *   request that is holding a customer at a locker door — the failure mode the
 *   fail-open design exists to avoid.
 * - `reconnectStrategy` backs off but never gives up, so the limiter comes back
 *   on its own once Redis does.
 *
 * Lua scripts are registered here because node-redis only accepts them at
 * construction; each one becomes a typed method on the returned client.
 */
export function createRedisClient(url: string) {
  return createClient({
    url,
    scripts: ATTEMPT_COUNTER_SCRIPTS,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: (retries) => Math.min(2_000, 50 * 2 ** retries),
    },
  });
}

/** Inferred from the factory, so it carries the registered scripts' methods. */
export type RedisClient = ReturnType<typeof createRedisClient>;
