import type { Pool } from 'mysql2/promise';
import type { RedisClient } from '../shared/redis/redis.client.js';
import { HealthService } from './health.service.js';

function fakeDeps(
  query: () => Promise<unknown>,
  ping: () => Promise<unknown> = () => Promise.resolve('PONG'),
) {
  const calls: string[] = [];
  const pool = {
    query: (sql: string) => {
      calls.push(sql);
      return query();
    },
  } as unknown as Pool;
  const redis = {
    ping: () => {
      calls.push('PING');
      return ping();
    },
  } as unknown as RedisClient;
  return { pool, redis, calls, service: new HealthService(pool, redis) };
}

const unreachable = () => Promise.reject(new Error('ECONNREFUSED'));

describe('HealthService', () => {
  describe('liveness', () => {
    it('reports ok without touching any dependency', () => {
      const { service, calls } = fakeDeps(unreachable, unreachable);

      expect(service.liveness()).toEqual({ status: 'ok' });
      expect(calls).toEqual([]);
    });
  });

  describe('readiness', () => {
    it('reports both up when they answer', async () => {
      const { service, calls } = fakeDeps(() =>
        Promise.resolve([[{ 1: 1 }], []]),
      );

      await expect(service.readiness()).resolves.toEqual({
        status: 'ok',
        db: 'up',
        redis: 'up',
      });
      expect(calls.sort()).toEqual(['PING', 'SELECT 1']);
    });

    it('reports an error when the pool cannot reach mysql', async () => {
      const { service } = fakeDeps(unreachable);

      await expect(service.readiness()).resolves.toEqual({
        status: 'error',
        db: 'down',
        redis: 'up',
      });
    });

    it('stays ok when only Redis is down', async () => {
      // The limiter fails open, so the instance still serves every request
      // correctly — reporting this as unready would empty the load balancer
      // over a cap being off.
      const { service } = fakeDeps(
        () => Promise.resolve([[{ 1: 1 }], []]),
        unreachable,
      );

      await expect(service.readiness()).resolves.toEqual({
        status: 'ok',
        db: 'up',
        redis: 'down',
      });
    });
  });
});
