import type { Pool } from 'mysql2/promise';
import { HealthService } from './health.service.js';

function fakePool(query: () => Promise<unknown>) {
  const calls: string[] = [];
  const pool = {
    query: (sql: string) => {
      calls.push(sql);
      return query();
    },
  } as unknown as Pool;
  return { pool, calls };
}

describe('HealthService', () => {
  describe('liveness', () => {
    it('reports ok without touching the database', () => {
      const { pool, calls } = fakePool(() =>
        Promise.reject(new Error('pool is down')),
      );

      expect(new HealthService(pool).liveness()).toEqual({ status: 'ok' });
      expect(calls).toEqual([]);
    });
  });

  describe('readiness', () => {
    it('reports the db up when the pool answers', async () => {
      const { pool, calls } = fakePool(() => Promise.resolve([[{ 1: 1 }], []]));

      await expect(new HealthService(pool).readiness()).resolves.toEqual({
        status: 'ok',
        db: 'up',
      });
      expect(calls).toEqual(['SELECT 1']);
    });

    it('reports an error when the pool cannot reach mysql', async () => {
      const { pool } = fakePool(() => Promise.reject(new Error('ECONNREFUSED')));

      await expect(new HealthService(pool).readiness()).resolves.toEqual({
        status: 'error',
        db: 'down',
      });
    });
  });
});
