import { createClient } from 'redis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

export type RedisClient = ReturnType<typeof createClient>;

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
 */
export function createRedisClient(url: string): RedisClient {
  return createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2_000,
      reconnectStrategy: (retries) => Math.min(2_000, 50 * 2 ** retries),
    },
  });
}
