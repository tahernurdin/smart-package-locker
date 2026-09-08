import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../shared/database/mysql.pool.js';
import { REDIS_CLIENT, type RedisClient } from '../shared/redis/redis.client.js';

export interface LivenessStatus {
  status: 'ok';
}

export interface ReadinessStatus {
  status: 'ok' | 'error';
  db: 'up' | 'down';
  redis: 'up' | 'down';
}

/**
 * The two probes answer different questions, and they fail differently on
 * purpose: liveness says "restart me", readiness says "stop sending traffic".
 */
@Injectable()
export class HealthService {
  constructor(
    @Inject(MYSQL_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {}

  /**
   * Liveness: the process is up and answering. Deliberately touches no
   * dependency — if this checked MySQL, one DB blip would restart every
   * instance at once and turn a recoverable outage into a full one.
   */
  liveness(): LivenessStatus {
    return { status: 'ok' };
  }

  /**
   * Readiness: this instance can actually serve a request, i.e. reach MySQL.
   *
   * Redis is reported but deliberately does not decide the verdict. Everything
   * built on it — the pickup attempt limiter — fails open, so an instance that
   * cannot reach Redis still serves every request correctly, just without the
   * cap. Letting it answer 503 would be strictly worse than the outage it is
   * reporting: Redis is shared, so every instance would fail the probe at the
   * same moment and the load balancer would empty the pool, turning "the
   * brute-force cap is off" into "nobody can collect a parcel".
   *
   * It is in the body because it still has to be *visible*. A silently
   * disabled security control is the thing to alarm on, and this is where an
   * operator looks for it.
   */
  async readiness(): Promise<ReadinessStatus> {
    const [db, redis] = await Promise.all([
      this.check(() => this.pool.query('SELECT 1')),
      this.check(() => this.redis.ping()),
    ]);
    return { status: db === 'up' ? 'ok' : 'error', db, redis };
  }

  private async check(probe: () => Promise<unknown>): Promise<'up' | 'down'> {
    try {
      await probe();
      return 'up';
    } catch {
      return 'down';
    }
  }
}
