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
 * Level 2 retrieval flow against a real MySQL. Run: `docker compose up -d mysql`
 * then `npm run test:e2e`.
 */
describe('Level 2 — retrieval (e2e)', () => {
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

  async function seedStoredPackage() {
    const op = await token('OPERATOR');
    const agent = await token('AGENT');
    await http()
      .post('/lockers')
      .set('authorization', `Bearer ${op}`)
      .send({ code: 'A-01', size: 'MEDIUM' })
      .expect(201);
    const stored = await http()
      .post('/packages')
      .set('authorization', `Bearer ${agent}`)
      .send({ size: 'MEDIUM', customer: { name: 'Jo', email: 'jo@example.com' } })
      .expect(201);
    return {
      op,
      agent,
      lockerId: stored.body.lockerId as string,
      pickupCode: stored.body.pickupCode as string,
      packageId: stored.body.packageId as string,
    };
  }

  it('retrieves a package, returns a fee-0 confirmation, and frees the locker', async () => {
    const { op, agent, lockerId, pickupCode, packageId } =
      await seedStoredPackage();
    const customer = await token('CUSTOMER');

    const res = await http()
      .post('/packages/retrieve')
      .set('authorization', `Bearer ${customer}`)
      .send({ lockerId, pickupCode })
      .expect(200);

    expect(res.body).toMatchObject({
      packageId,
      lockerId,
      lockerCode: 'A-01',
      opened: true,
      storageFee: { amountMinor: 0, currency: 'AUD' },
    });
    expect(typeof res.body.retrievedAt).toBe('string');

    const lockers = await http()
      .get('/lockers')
      .set('authorization', `Bearer ${op}`)
      .expect(200);
    expect(
      lockers.body.find((l: { code: string }) => l.code === 'A-01'),
    ).toMatchObject({ availability: 'FREE', activePackageId: null });

    // the freed locker takes a new package
    await http()
      .post('/packages')
      .set('authorization', `Bearer ${agent}`)
      .send({ size: 'MEDIUM', customer: { name: 'Amy', phone: '111' } })
      .expect(201);
  });

  it('rejects every invalid retrieval the same way', async () => {
    const { lockerId, pickupCode } = await seedStoredPackage();
    const customer = await token('CUSTOMER');
    const retrieve = (body: Record<string, string>) =>
      http()
        .post('/packages/retrieve')
        .set('authorization', `Bearer ${customer}`)
        .send(body);

    await retrieve({ lockerId, pickupCode }).expect(200);

    const repeat = await retrieve({ lockerId, pickupCode }).expect(404);
    expect(repeat.body.code).toBe('retrieval_failed');

    await retrieve({ lockerId, pickupCode: '000000' }).expect(404);
    await retrieve({
      lockerId: '0a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
      pickupCode: '123456',
    }).expect(404);
    await retrieve({ lockerId: 'not-a-uuid', pickupCode: '12' }).expect(400);
  });

  it('enforces role and authentication', async () => {
    const { agent, lockerId, pickupCode } = await seedStoredPackage();

    await http()
      .post('/packages/retrieve')
      .set('authorization', `Bearer ${agent}`)
      .send({ lockerId, pickupCode })
      .expect(403);

    await http()
      .post('/packages/retrieve')
      .send({ lockerId, pickupCode })
      .expect(401);
  });

  it('retrieves a package at most once under concurrent requests', async () => {
    const { lockerId, pickupCode } = await seedStoredPackage();
    const customer = await token('CUSTOMER');

    const statuses = await Promise.all(
      Array.from({ length: 6 }, () =>
        http()
          .post('/packages/retrieve')
          .set('authorization', `Bearer ${customer}`)
          .send({ lockerId, pickupCode })
          .then((r) => r.status),
      ),
    );

    expect(statuses.filter((s) => s === 200)).toHaveLength(1);

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM package WHERE retrieved_at IS NOT NULL',
    );
    expect(Number(rows[0].count)).toBe(1);
  });
});
