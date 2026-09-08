import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  APP_CONFIG,
  type AppConfiguration,
} from '../../shared/config/configuration.js';
import { REDIS_CLIENT, type RedisClient } from '../../shared/redis/redis.client.js';
import type {
  PickupAttemptBlock,
  PickupAttemptLimiter,
} from '../domain/pickup-attempt-limiter.js';

/**
 * Returns 0 while the caller may attempt, else the milliseconds left on the
 * block. Reading the count and its TTL in one script keeps them consistent and
 * costs one round trip.
 */
const READ_BLOCK = `
local attempts = tonumber(redis.call('GET', KEYS[1]) or '0')
if attempts < tonumber(ARGV[1]) then return 0 end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then return 0 end
return ttl`;

/**
 * Counts a failure and (re)sets the expiry.
 *
 * The expiry is refreshed on *every* counted failure, which is what makes the
 * block last the configured time rather than whatever remained of a window
 * opened by the first attempt. Blocked attempts never reach here — they are
 * rejected before any counting — so the key is not kept alive by the requests
 * it is rejecting, and it expires exactly one lockout after the last failure
 * that earned it.
 *
 * INCR and PEXPIRE together, because an INCR whose PEXPIRE is lost to a dropped
 * connection leaves a key that never expires: a permanent lockout.
 */
const COUNT_FAILURE = `
redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 1`;

@Injectable()
export class RedisPickupAttemptLimiter implements PickupAttemptLimiter {
  private readonly logger = new Logger(RedisPickupAttemptLimiter.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    @Inject(APP_CONFIG) private readonly config: AppConfiguration,
  ) {}

  async check(
    customerId: string,
    lockerId: string,
  ): Promise<PickupAttemptBlock | null> {
    const remainingMs = await this.run('check', () =>
      this.redis.eval(READ_BLOCK, {
        keys: [this.key(customerId, lockerId)],
        arguments: [String(this.config.retrievalLimit.maxAttempts)],
      }),
    );
    const ms = Number(remainingMs ?? 0);
    if (!ms || ms <= 0) return null;
    return { retryAfterSeconds: Math.ceil(ms / 1000) };
  }

  async recordFailure(customerId: string, lockerId: string): Promise<void> {
    await this.run('recordFailure', () =>
      this.redis.eval(COUNT_FAILURE, {
        keys: [this.key(customerId, lockerId)],
        arguments: [String(this.config.retrievalLimit.lockoutSeconds * 1000)],
      }),
    );
  }

  async clear(customerId: string, lockerId: string): Promise<void> {
    await this.run('clear', () => this.redis.del(this.key(customerId, lockerId)));
  }

  /**
   * Fail open. Every caller treats `null` as "no block", so an unreachable
   * Redis leaves the limiter off rather than sealing a locker shut. Logged at
   * `error` because a silently disabled brute-force cap is exactly the kind of
   * thing that should page someone.
   */
  private async run<T>(op: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(
        `Pickup attempt limiter unavailable (${op}), failing open: ${
          (err as Error).message
        }`,
      );
      return null;
    }
  }

  /** The caller's own subject, never the parcel owner's — see the port. */
  private key(customerId: string, lockerId: string): string {
    return `retrieval:attempts:${customerId}:${lockerId}`;
  }
}
