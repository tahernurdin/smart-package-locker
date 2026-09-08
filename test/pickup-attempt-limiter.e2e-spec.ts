import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { AppConfiguration } from '../src/shared/config/configuration.js';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import {
  createRedisClient,
  type RedisClient,
} from '../src/shared/redis/redis.client.js';
import { RedisPickupAttemptLimiter } from '../src/packages/infrastructure/redis-pickup-attempt-limiter.js';

const LOCKOUT_SECONDS = 60;

function configWith(maxAttempts: number): AppConfiguration {
  return {
    retrievalLimit: { maxAttempts, lockoutSeconds: LOCKOUT_SECONDS },
  } as AppConfiguration;
}

/**
 * The limiter against a real Redis. Every test uses a fresh customer id, so the
 * keys cannot collide and nothing has to be flushed — this must stay safe to
 * run against a Redis someone else is also using.
 */
describe('RedisPickupAttemptLimiter (e2e)', () => {
  let redis: RedisClient;
  let limiter: RedisPickupAttemptLimiter;
  let customer: string;
  const LOCKER = 'locker-1';

  beforeAll(async () => {
    redis = createRedisClient(loadConfiguration().redis.url);
    redis.on('error', () => undefined);
    await redis.connect();
    limiter = new RedisPickupAttemptLimiter(redis, configWith(5));
  });

  beforeEach(() => {
    customer = randomUUID();
  });

  afterAll(async () => {
    await redis?.close();
  });

  const key = (c: string, l: string) => `retrieval:attempts:${c}:${l}`;

  it('allows the configured attempts, then blocks', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await limiter.check(customer, LOCKER)).toBeNull();
      await limiter.recordFailure(customer, LOCKER);
    }

    const block = await limiter.check(customer, LOCKER);
    expect(block).not.toBeNull();
    expect(block?.retryAfterSeconds).toBeGreaterThan(0);
    expect(block?.retryAfterSeconds).toBeLessThanOrEqual(LOCKOUT_SECONDS);
  });

  it('refreshes the expiry on every failure, so the block runs from the last one', async () => {
    // The bug this guards: setting the TTL only on the first failure anchors
    // the window to the first attempt, and a burst of five then unblocks
    // seconds later instead of a full lockout after the fifth.
    await limiter.recordFailure(customer, LOCKER);
    await redis.pExpire(key(customer, LOCKER), 1_000);
    expect(await redis.pTTL(key(customer, LOCKER))).toBeLessThanOrEqual(1_000);

    await limiter.recordFailure(customer, LOCKER);

    expect(await redis.pTTL(key(customer, LOCKER))).toBeGreaterThan(
      LOCKOUT_SECONDS * 1_000 - 5_000,
    );
  });

  it('counts each customer and each locker separately', async () => {
    const other = randomUUID();
    for (let i = 0; i < 5; i++) await limiter.recordFailure(customer, LOCKER);

    expect(await limiter.check(customer, LOCKER)).not.toBeNull();
    // A different door, and a different caller at the same door, are untouched
    // — one customer's failures can never lock anyone else out.
    expect(await limiter.check(customer, 'locker-2')).toBeNull();
    expect(await limiter.check(other, LOCKER)).toBeNull();
  });

  it('forgets the attempts when cleared', async () => {
    for (let i = 0; i < 5; i++) await limiter.recordFailure(customer, LOCKER);
    expect(await limiter.check(customer, LOCKER)).not.toBeNull();

    await limiter.clear(customer, LOCKER);
    expect(await limiter.check(customer, LOCKER)).toBeNull();
  });

  it('fails open when Redis is unreachable', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    // Never connected — the same state the app is in when Redis is refusing
    // connections at boot, and every command rejects.
    const dead = createRedisClient('redis://127.0.0.1:6390');
    dead.on('error', () => undefined);
    const offline = new RedisPickupAttemptLimiter(dead, configWith(5));

    // No throw, and no block: a customer standing at a locker is not held there
    // by a counter store being down.
    await expect(
      offline.recordFailure(customer, LOCKER),
    ).resolves.toBeUndefined();
    expect(await offline.check(customer, LOCKER)).toBeNull();
    await expect(offline.clear(customer, LOCKER)).resolves.toBeUndefined();
  });
});
