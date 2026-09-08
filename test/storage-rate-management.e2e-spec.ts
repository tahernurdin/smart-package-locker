import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'mysql2/promise';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { MYSQL_POOL } from '../src/shared/database/mysql.pool.js';

/**
 * Operator management of storage rates. The shape of this API is the point: a
 * price change publishes a new future-dated version, and nothing edits or
 * deletes a published one, so a fee already charged stays reproducible.
 */

// Everything the seed publishes sits at this instant; the suite cleans up only
// what it published itself, leaving the seed for the other suites.
const SEED_EFFECTIVE_FROM = '2026-01-01 00:00:00.000000';

const VERSION = {
  sizeCode: 'SMALL',
  effectiveFrom: '2031-03-01T00:00:00.000Z',
  bands: [
    { fromDay: 0, toDay: 2, rateMinor: 0 },
    { fromDay: 2, toDay: null, rateMinor: 750 },
  ],
};

describe('Storage rate management (e2e)', () => {
  let app: INestApplication<App>;
  let pool: Pool;

  beforeAll(async () => {
    await runMigrations(loadConfiguration().database, { log: () => undefined });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.listen(0);
    pool = app.get<Pool>(MYSQL_POOL);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM storage_rate WHERE effective_from > :seed', {
      seed: SEED_EFFECTIVE_FROM,
    });
  });

  afterAll(async () => {
    await pool?.query('DELETE FROM storage_rate WHERE effective_from > :seed', {
      seed: SEED_EFFECTIVE_FROM,
    });
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function token(role: string): Promise<string> {
    const res = await http().post('/auth/dev-token').send({ role }).expect(201);
    return res.body.token as string;
  }

  async function operator(): Promise<string> {
    return token('OPERATOR');
  }

  it('publishes a version and lists it newest-first alongside the seeded one', async () => {
    const auth = await operator();

    const created = await http()
      .post('/storage-rates')
      .set('Authorization', `Bearer ${auth}`)
      .send(VERSION)
      .expect(201);

    expect(created.body).toMatchObject({
      sizeCode: 'SMALL',
      effectiveFrom: '2031-03-01T00:00:00.000Z',
      bands: [
        { fromDay: 0, toDay: 2, rateMinor: 0 },
        { fromDay: 2, toDay: null, rateMinor: 750 },
      ],
    });

    const listed = await http()
      .get('/storage-rates?sizeCode=SMALL')
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);

    expect(
      listed.body.map((v: { effectiveFrom: string }) => v.effectiveFrom),
    ).toEqual(['2031-03-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z']);
  });

  it('filters the listing by size', async () => {
    const auth = await operator();

    const listed = await http()
      .get('/storage-rates?sizeCode=LARGE')
      .set('Authorization', `Bearer ${auth}`)
      .expect(200);

    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].sizeCode).toBe('LARGE');
  });

  it('refuses a second version of the same size at the same instant', async () => {
    const auth = await operator();

    await http()
      .post('/storage-rates')
      .set('Authorization', `Bearer ${auth}`)
      .send(VERSION)
      .expect(201);

    const clash = await http()
      .post('/storage-rates')
      .set('Authorization', `Bearer ${auth}`)
      .send({ ...VERSION, bands: [{ fromDay: 0, toDay: null, rateMinor: 1 }] })
      .expect(409);

    expect(clash.body.code).toBe('storage_rate_version_exists');
  });

  it('refuses a backdated version', async () => {
    const auth = await operator();

    const res = await http()
      .post('/storage-rates')
      .set('Authorization', `Bearer ${auth}`)
      .send({ ...VERSION, effectiveFrom: '2020-01-01T00:00:00.000Z' })
      .expect(422);

    expect(res.body.code).toBe('storage_rate_backdated');
  });

  it('refuses bands that leave a day unpriced', async () => {
    const auth = await operator();

    const res = await http()
      .post('/storage-rates')
      .set('Authorization', `Bearer ${auth}`)
      .send({
        ...VERSION,
        bands: [
          { fromDay: 0, toDay: 2, rateMinor: 0 },
          { fromDay: 3, toDay: null, rateMinor: 750 },
        ],
      })
      .expect(422);

    expect(res.body.code).toBe('invalid_storage_rate_schedule');
  });

  it('refuses a schedule with no open-ended tail', async () => {
    const auth = await operator();

    await http()
      .post('/storage-rates')
      .set('Authorization', `Bearer ${auth}`)
      .send({ ...VERSION, bands: [{ fromDay: 0, toDay: 2, rateMinor: 0 }] })
      .expect(422);
  });

  it('is operator-only', async () => {
    const agent = await token('AGENT');

    await http()
      .post('/storage-rates')
      .set('Authorization', `Bearer ${agent}`)
      .send(VERSION)
      .expect(403);

    await http().get('/storage-rates').expect(401);
  });
});
