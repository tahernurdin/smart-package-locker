import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { MYSQL_POOL } from '../shared/database/mysql.pool.js';

export interface HealthStatus {
  status: 'ok';
  db: 'up' | 'down';
}

/**
 * Liveness probe. `status` is `ok` while the process can answer; `db` reflects
 * whether the pool can reach MySQL.
 */
@Injectable()
export class HealthService {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async check(): Promise<HealthStatus> {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'ok', db: 'up' };
    } catch {
      return { status: 'ok', db: 'down' };
    }
  }
}
