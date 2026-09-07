import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  db: 'up' | 'down';
}

/**
 * Liveness probe. `status` is always `ok` while the process can answer; `db`
 * reflects connectivity.
 *
 * Task 02 replaces the stub below with a real `SELECT 1` against the pool.
 */
@Injectable()
export class HealthService {
  async check(): Promise<HealthStatus> {
    return { status: 'ok', db: 'up' };
  }
}
