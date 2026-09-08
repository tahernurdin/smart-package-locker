import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import type { RedisClient } from '../shared/redis/redis.client.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

const reachable = () => Promise.resolve([[{ 1: 1 }], []]);
const unreachable = () => Promise.reject(new Error('ECONNREFUSED'));

function controllerFor(
  query: () => Promise<unknown>,
  ping: () => Promise<unknown> = () => Promise.resolve('PONG'),
) {
  const pool = { query } as unknown as Pool;
  const redis = { ping } as unknown as RedisClient;
  return new HealthController(new HealthService(pool, redis));
}

describe('HealthController', () => {
  it('stays live while the database is down', () => {
    expect(controllerFor(unreachable).live()).toEqual({ status: 'ok' });
  });

  it('is ready when the database answers', async () => {
    await expect(controllerFor(reachable).ready()).resolves.toEqual({
      status: 'ok',
      db: 'up',
      redis: 'up',
    });
  });

  it('stays ready when only Redis is down, and says so', async () => {
    // Traffic must keep flowing: the one thing Redis backs fails open.
    await expect(controllerFor(reachable, unreachable).ready()).resolves.toEqual(
      { status: 'ok', db: 'up', redis: 'down' },
    );
  });

  it('answers 503 when the database is unreachable', async () => {
    const error = await controllerFor(unreachable)
      .ready()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      status: 'error',
      db: 'down',
      redis: 'up',
    });
  });
});
