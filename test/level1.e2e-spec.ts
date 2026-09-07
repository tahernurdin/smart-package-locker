import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { MYSQL_POOL } from '../src/shared/database/mysql.pool.js';

/**
 * Full Level 1 flow against a real MySQL. Run: `docker compose up -d mysql`
 * (or point env at any MySQL 8), then `npm run test:e2e`.
 */
describe('Level 1 (e2e)', () => {
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
    pool = app.get<Pool>(MYSQL_POOL);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM package');
    await pool.query('DELETE FROM locker');
    await pool.query('DELETE FROM customer');
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function token(role: string): Promise<string> {
    const res = await http().post('/auth/dev-token').send({ role }).expect(201);
    return res.body.token as string;
  }

  function createLocker(op: string, code: string, size: string) {
    return http()
      .post('/lockers')
      .set('authorization', `Bearer ${op}`)
      .send({ code, size });
  }

  function storePackage(
    agent: string,
    size: string,
    customer: Record<string, string>,
  ) {
    return http()
      .post('/packages')
      .set('authorization', `Bearer ${agent}`)
      .send({ size, customer });
  }

  it('creates lockers, stores by smallest fit, and reports occupancy', async () => {
    const op = await token('OPERATOR');
    const agent = await token('AGENT');

    await createLocker(op, 'A-S', 'SMALL').expect(201);
    await createLocker(op, 'A-M', 'MEDIUM').expect(201);
    await createLocker(op, 'A-L', 'LARGE').expect(201);

    const listed = await http()
      .get('/lockers')
      .set('authorization', `Bearer ${op}`)
      .expect(200);
    expect(listed.body.map((l: { availability: string }) => l.availability)).toEqual([
      'FREE',
      'FREE',
      'FREE',
    ]);

    // SMALL package -> the SMALL locker
    const first = await storePackage(agent, 'SMALL', {
      name: 'Jo',
      email: 'jo@example.com',
    }).expect(201);
    expect(first.body.lockerCode).toBe('A-S');
    expect(first.body.pickupCode).toMatch(/^\d{6}$/);

    const afterFirst = await http()
      .get('/lockers')
      .set('authorization', `Bearer ${op}`)
      .expect(200);
    expect(
      afterFirst.body.find((l: { code: string }) => l.code === 'A-S'),
    ).toMatchObject({ availability: 'OCCUPIED', activePackageId: first.body.packageId });

    // SMALL again, SMALL locker taken -> MEDIUM
    const second = await storePackage(agent, 'SMALL', {
      name: 'Amy',
      phone: '111',
    }).expect(201);
    expect(second.body.lockerCode).toBe('A-M');

    // LARGE -> LARGE
    const third = await storePackage(agent, 'LARGE', {
      name: 'Kim',
      email: 'kim@example.com',
    }).expect(201);
    expect(third.body.lockerCode).toBe('A-L');

    // Every locker full -> 409
    const full = await storePackage(agent, 'SMALL', {
      name: 'Zoe',
      phone: '222',
    }).expect(409);
    expect(full.body.code).toBe('no_suitable_locker');
  });

  it('enforces roles and authentication', async () => {
    const agent = await token('AGENT');

    await http()
      .post('/lockers')
      .set('authorization', `Bearer ${agent}`)
      .send({ code: 'X', size: 'SMALL' })
      .expect(403);

    await http()
      .post('/packages')
      .send({ size: 'SMALL', customer: { name: 'x', phone: '9' } })
      .expect(401);
  });

  it('never double-books a locker under concurrent stores', async () => {
    const op = await token('OPERATOR');
    const agent = await token('AGENT');
    await createLocker(op, 'ONLY-1', 'SMALL').expect(201);

    const statuses = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        storePackage(agent, 'SMALL', { name: `U${i}`, phone: `${i}` }).then(
          (r) => r.status,
        ),
      ),
    );

    // L1 guarantee: the unique constraint admits exactly one. (L4 adds a retry
    // so losers get reassigned to other free lockers instead of a 409.)
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM package',
    );
    expect(rows[0].count).toBe(1);
  });
});
