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
 * The counting itself is two Lua scripts registered on the client — see
 * `shared/redis/attempt-counter.scripts.ts` for why each is a script and not a
 * pair of commands. What lives here is the policy: which key a caller counts
 * against, and what the counts mean.
 */
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
      this.redis.readAttemptBlock(
        this.key(customerId, lockerId),
        this.config.retrievalLimit.maxAttempts,
      ),
    );
    const ms = remainingMs ?? 0;
    if (ms <= 0) return null;
    return { retryAfterSeconds: Math.ceil(ms / 1000) };
  }

  async recordFailure(customerId: string, lockerId: string): Promise<void> {
    await this.run('recordFailure', () =>
      this.redis.countAttemptFailure(
        this.key(customerId, lockerId),
        this.config.retrievalLimit.lockoutSeconds * 1000,
      ),
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
