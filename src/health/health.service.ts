import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../shared/database/mysql.pool.js';

export interface LivenessStatus {
  status: 'ok';
}

export interface ReadinessStatus {
  status: 'ok' | 'error';
  db: 'up' | 'down';
}

/**
 * The two probes answer different questions, and they fail differently on
 * purpose: liveness says "restart me", readiness says "stop sending traffic".
 */
@Injectable()
export class HealthService {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Liveness: the process is up and answering. Deliberately touches no
   * dependency — if this checked MySQL, one DB blip would restart every
   * instance at once and turn a recoverable outage into a full one.
   */
  liveness(): LivenessStatus {
    return { status: 'ok' };
  }

  /** Readiness: this instance can actually serve a request, i.e. reach MySQL. */
  async readiness(): Promise<ReadinessStatus> {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'ok', db: 'up' };
    } catch {
      return { status: 'error', db: 'down' };
    }
  }
}
