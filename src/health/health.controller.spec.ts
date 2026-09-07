import { HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

function controllerFor(query: () => Promise<unknown>) {
  const pool = { query } as unknown as Pool;
  return new HealthController(new HealthService(pool));
}

const reachable = () => Promise.resolve([[{ 1: 1 }], []]);
const unreachable = () => Promise.reject(new Error('ECONNREFUSED'));

describe('HealthController', () => {
  it('stays live while the database is down', () => {
    expect(controllerFor(unreachable).live()).toEqual({ status: 'ok' });
  });

  it('is ready when the database answers', async () => {
    await expect(controllerFor(reachable).ready()).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
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
    });
  });
});
