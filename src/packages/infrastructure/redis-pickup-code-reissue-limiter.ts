import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  APP_CONFIG,
  type AppConfiguration,
} from '../../shared/config/configuration.js';
import {
  REDIS_CLIENT,
  type RedisClient,
} from '../../shared/redis/redis.client.js';
import type {
  PickupCodeReissueBlock,
  PickupCodeReissueLimiter,
} from '../domain/pickup-code-reissue-limiter.js';

/**
 * The same two counter scripts the attempt limiter uses — a count with a
 * lockout is all "three per hour" needs — under a key of their own, so re-issues
 * and failed guesses can never spend each other's budget.
 *
 * There is no `clear` here, unlike the attempt limiter: the key is left to
 * expire on its own. That expiry *is* the window, and the only way back to a
 * fresh budget is to wait it out.
 */
@Injectable()
export class RedisPickupCodeReissueLimiter implements PickupCodeReissueLimiter {
  private readonly logger = new Logger(RedisPickupCodeReissueLimiter.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    @Inject(APP_CONFIG) private readonly config: AppConfiguration,
  ) {}

  async check(packageId: string): Promise<PickupCodeReissueBlock | null> {
    const remainingMs = await this.run('check', () =>
      this.redis.readAttemptBlock(
        this.key(packageId),
        this.config.pickupCodeReissue.maxPerWindow,
      ),
    );
    const ms = remainingMs ?? 0;
    if (ms <= 0) return null;
    return { retryAfterSeconds: Math.ceil(ms / 1000) };
  }

  async recordIssue(packageId: string): Promise<void> {
    await this.run('recordIssue', () =>
      this.redis.countAttemptFailure(
        this.key(packageId),
        this.config.pickupCodeReissue.windowSeconds * 1000,
      ),
    );
  }

  /**
   * Fail open, for the same reason the attempt limiter does: a counter store
   * being down must not be what stands between a customer and their parcel.
   */
  private async run<T>(op: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.error(
        `Pickup code reissue limiter unavailable (${op}), failing open: ${
          (err as Error).message
        }`,
      );
      return null;
    }
  }

  private key(packageId: string): string {
    return `pickup-code:reissues:${packageId}`;
  }
}
