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
 * The limiter against a real Redis. Every test uses a fresh locker id, so the
 * keys cannot collide and nothing has to be flushed — this must stay safe to
 * run against a Redis someone else is also using.
 */
describe('RedisPickupAttemptLimiter (e2e)', () => {
  let redis: RedisClient;
  let limiter: RedisPickupAttemptLimiter;
  let locker: string;

  beforeAll(async () => {
    redis = createRedisClient(loadConfiguration().redis.url);
    redis.on('error', () => undefined);
    await redis.connect();
    limiter = new RedisPickupAttemptLimiter(redis, configWith(5));
  });

  beforeEach(() => {
    locker = randomUUID();
  });

  afterAll(async () => {
    await redis?.close();
  });

  const key = (l: string) => `retrieval:attempts:${l}`;

  it('allows the configured attempts, then blocks', async () => {
    for (let i = 0; i < 5; i++) {
      expect(await limiter.check(locker)).toBeNull();
      await limiter.recordFailure(locker);
    }

    const block = await limiter.check(locker);
    expect(block).not.toBeNull();
    expect(block?.retryAfterSeconds).toBeGreaterThan(0);
    expect(block?.retryAfterSeconds).toBeLessThanOrEqual(LOCKOUT_SECONDS);
  });

  it('refreshes the expiry on every failure, so the block runs from the last one', async () => {
    // The bug this guards: setting the TTL only on the first failure anchors
    // the window to the first attempt, and a burst of five then unblocks
    // seconds later instead of a full lockout after the fifth.
    await limiter.recordFailure(locker);
    await redis.pExpire(key(locker), 1_000);
    expect(await redis.pTTL(key(locker))).toBeLessThanOrEqual(1_000);

    await limiter.recordFailure(locker);

    expect(await redis.pTTL(key(locker))).toBeGreaterThan(
      LOCKOUT_SECONDS * 1_000 - 5_000,
    );
  });

  it('counts each locker separately', async () => {
    const other = randomUUID();
    for (let i = 0; i < 5; i++) await limiter.recordFailure(locker);

    expect(await limiter.check(locker)).not.toBeNull();
    // Guessing at one door never freezes the one beside it.
    expect(await limiter.check(other)).toBeNull();
  });

  it('forgets the attempts when cleared', async () => {
    for (let i = 0; i < 5; i++) await limiter.recordFailure(locker);
    expect(await limiter.check(locker)).not.toBeNull();

    await limiter.clear(locker);
    expect(await limiter.check(locker)).toBeNull();
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
    await expect(offline.recordFailure(locker)).resolves.toBeUndefined();
    expect(await offline.check(locker)).toBeNull();
    await expect(offline.clear(locker)).resolves.toBeUndefined();
  });
});
