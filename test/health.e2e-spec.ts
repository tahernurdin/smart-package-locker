import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health/live returns ok without a db check', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready reports the db and redis up', async () => {
    // Polled because boot does not wait on Redis: the client connects in the
    // background, so a probe fired immediately after `app.init()` can honestly
    // answer `redis: 'down'` for a few milliseconds. It never gates the
    // verdict, which is why that is reported rather than fatal.
    await expect
      .poll(async () => {
        const res = await request(app.getHttpServer())
          .get('/health/ready')
          .expect(200);
        return res.body;
      })
      .toEqual({ status: 'ok', db: 'up', redis: 'up' });
  });

  it('GET /health is not a route', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });
});
