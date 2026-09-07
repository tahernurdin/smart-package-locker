import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { DEFAULT_STATION_ID } from '../src/lockers/application/create-locker.service.js';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { MYSQL_POOL } from '../src/shared/database/mysql.pool.js';

/**
 * Full Level 1 flow against a real MySQL: create customer -> register package ->
 * store it -> list lockers. Run: `docker compose up -d mysql`, then
 * `npm run test:e2e`.
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
    await pool.query('DELETE FROM locker_assignment');
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

  async function createCustomer(agent: string): Promise<string> {
    const res = await http()
      .post('/customers')
      .set('authorization', `Bearer ${agent}`)
      .send({ name: 'Jo', email: `jo-${Math.random().toString(36).slice(2)}@example.com` })
      .expect(201);
    return res.body.customerId as string;
  }

  async function registerPackage(
    agent: string,
    size: string,
    customerId: string,
  ): Promise<string> {
    const res = await http()
      .post('/packages')
      .set('authorization', `Bearer ${agent}`)
      .send({ size, customerId })
      .expect(201);
    return res.body.packageId as string;
  }

  it('creates lockers, stores by smallest fit, and reports occupancy', async () => {
    const op = await token('OPERATOR');
    const agent = await token('AGENT');
    const customerId = await createCustomer(agent);

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
    expect(listed.body[0]).toMatchObject({
      stationId: DEFAULT_STATION_ID,
      stationName: 'Default Station',
      location: 'HQ',
    });

    // SMALL package -> the SMALL locker
    const p1 = await registerPackage(agent, 'SMALL', customerId);
    const first = await http()
      .post(`/packages/${p1}/store`)
      .set('authorization', `Bearer ${agent}`)
      .expect(200);
    expect(first.body.lockerCode).toBe('A-S');
    expect(first.body.pickupCode).toMatch(/^\d{6}$/);
    expect(first.body.status).toBe('STORED');

    const afterFirst = await http()
      .get('/lockers')
      .set('authorization', `Bearer ${op}`)
      .expect(200);
    expect(
      afterFirst.body.find((l: { code: string }) => l.code === 'A-S'),
    ).toMatchObject({ availability: 'OCCUPIED', activePackageId: p1 });

    // SMALL again, SMALL locker taken -> MEDIUM
    const p2 = await registerPackage(agent, 'SMALL', customerId);
    const second = await http()
      .post(`/packages/${p2}/store`)
      .set('authorization', `Bearer ${agent}`)
      .expect(200);
    expect(second.body.lockerCode).toBe('A-M');

    // LARGE -> LARGE
    const p3 = await registerPackage(agent, 'LARGE', customerId);
    const third = await http()
      .post(`/packages/${p3}/store`)
      .set('authorization', `Bearer ${agent}`)
      .expect(200);
    expect(third.body.lockerCode).toBe('A-L');

    // Every locker full -> 409
    const p4 = await registerPackage(agent, 'SMALL', customerId);
    const full = await http()
      .post(`/packages/${p4}/store`)
      .set('authorization', `Bearer ${agent}`)
      .expect(409);
    expect(full.body.code).toBe('no_suitable_locker');
  });

  it('rejects registering against an unknown customer, and storing an unknown package', async () => {
    const agent = await token('AGENT');

    await http()
      .post('/packages')
      .set('authorization', `Bearer ${agent}`)
      .send({ size: 'SMALL', customerId: '0a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d' })
      .expect(404);

    await http()
      .post('/packages/0a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d/store')
      .set('authorization', `Bearer ${agent}`)
      .expect(404);
  });

  it('rejects storing the same package twice', async () => {
    const op = await token('OPERATOR');
    const agent = await token('AGENT');
    const customerId = await createCustomer(agent);
    await createLocker(op, 'D-1', 'MEDIUM').expect(201);

    const pkg = await registerPackage(agent, 'MEDIUM', customerId);
    await http()
      .post(`/packages/${pkg}/store`)
      .set('authorization', `Bearer ${agent}`)
      .expect(200);
    const again = await http()
      .post(`/packages/${pkg}/store`)
      .set('authorization', `Bearer ${agent}`)
      .expect(409);
    expect(again.body.code).toBe('package_already_stored');
  });

  it('filters the locker list by station', async () => {
    const op = await token('OPERATOR');
    await createLocker(op, 'F-1', 'SMALL').expect(201);

    const atDefault = await http()
      .get(`/lockers?stationId=${DEFAULT_STATION_ID}`)
      .set('authorization', `Bearer ${op}`)
      .expect(200);
    expect(atDefault.body).toHaveLength(1);

    const elsewhere = await http()
      .get('/lockers?stationId=0a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d')
      .set('authorization', `Bearer ${op}`)
      .expect(200);
    expect(elsewhere.body).toEqual([]);

    await http()
      .get('/lockers?stationId=not-a-uuid')
      .set('authorization', `Bearer ${op}`)
      .expect(400);
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
      .send({ size: 'SMALL', customerId: DEFAULT_STATION_ID })
      .expect(401);
  });

  it('never double-books a locker under concurrent stores', async () => {
    const op = await token('OPERATOR');
    const agent = await token('AGENT');
    const customerId = await createCustomer(agent);
    await createLocker(op, 'ONLY-1', 'SMALL').expect(201);

    const packageIds = await Promise.all(
      Array.from({ length: 8 }, () => registerPackage(agent, 'SMALL', customerId)),
    );

    const statuses = await Promise.all(
      packageIds.map((id) =>
        http()
          .post(`/packages/${id}/store`)
          .set('authorization', `Bearer ${agent}`)
          .then((r) => r.status),
      ),
    );

    expect(statuses.filter((s) => s === 200)).toHaveLength(1);

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM locker_assignment',
    );
    expect(Number(rows[0].count)).toBe(1);
  });
});
