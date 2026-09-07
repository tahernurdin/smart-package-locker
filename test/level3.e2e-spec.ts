import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/shared/clock/clock.js';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { MYSQL_POOL } from '../src/shared/database/mysql.pool.js';
import { SEEDED_STATION_ID } from './seeded-station.js';

const STORED_AT = '2026-06-01T00:00:00.000Z';
const PLUS_7_DAYS = '2026-06-08T00:00:00.000Z';
const PLUS_14_DAYS = '2026-06-15T00:00:00.000Z';

/**
 * Level 3 storage fees against a real MySQL. `CLOCK` is overridden with a
 * mutable fake so a multi-day stay can be simulated instantly.
 */
describe('Level 3 — storage fees (e2e)', () => {
  let app: INestApplication<App>;
  let pool: Pool;
  let tokens: { operator: string; agent: string; customer: string };
  const clock = {
    current: new Date(STORED_AT),
    now() {
      return this.current;
    },
  };

  beforeAll(async () => {
    await runMigrations(loadConfiguration().database, { log: () => undefined });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(clock)
      .compile();
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
    tokens = {
      operator: await token('OPERATOR'),
      agent: await token('AGENT'),
      customer: await token('CUSTOMER'),
    };
  });

  beforeEach(async () => {
    clock.current = new Date(STORED_AT);
    await pool.query('DELETE FROM locker_assignment');
    await pool.query('DELETE FROM package');
    await pool.query('DELETE FROM locker');
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function token(role: string): Promise<string> {
    const res = await http().post('/auth/dev-token').send({ role }).expect(201);
    return res.body.token as string;
  }

  // A customer id as it would arrive from the upstream customer service.
  const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

  async function store(size: string, code: string) {
    await http()
      .post('/lockers')
      .set('authorization', `Bearer ${tokens.operator}`)
      .send({ code, size, stationId: SEEDED_STATION_ID })
      .expect(201);
    const registered = await http()
      .post('/packages')
      .set('authorization', `Bearer ${tokens.agent}`)
      .send({ size, customerId: CUSTOMER_ID })
      .expect(201);
    const res = await http()
      .post(`/packages/${registered.body.packageId}/store`)
      .send({ stationId: SEEDED_STATION_ID })
      .set('authorization', `Bearer ${tokens.agent}`)
      .expect(200);
    return res.body as {
      packageId: string;
      lockerId: string;
      pickupCode: string;
    };
  }

  const retrieve = (lockerId: string, pickupCode: string) =>
    http()
      .post('/packages/retrieve')
      .set('authorization', `Bearer ${tokens.customer}`)
      .send({ lockerId, pickupCode });

  async function snapshottedFee(packageId: string): Promise<number> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT storage_fee_minor FROM locker_assignment WHERE package_id = :id',
      { id: packageId },
    );
    return Number(rows[0].storage_fee_minor);
  }

  it('charges the tiered fee for a 7-day SMALL stay and snapshots it', async () => {
    const { packageId, lockerId, pickupCode } = await store('SMALL', 'S-1');

    clock.current = new Date(PLUS_7_DAYS);
    const res = await retrieve(lockerId, pickupCode).expect(200);

    expect(res.body.storageFee).toEqual({ amountMinor: 4600, currency: 'AUD' });
    expect(await snapshottedFee(packageId)).toBe(4600);
  });

  it('charges nothing for an immediate retrieval (first day is free)', async () => {
    const { lockerId, pickupCode } = await store('MEDIUM', 'M-1');
    const res = await retrieve(lockerId, pickupCode).expect(200);
    expect(res.body.storageFee.amountMinor).toBe(0);
  });

  it('does not rewrite an already-snapshotted fee when the rate changes later', async () => {
    const first = await store('SMALL', 'S-1');
    clock.current = new Date(PLUS_7_DAYS);
    await retrieve(first.lockerId, first.pickupCode).expect(200);
    expect(await snapshottedFee(first.packageId)).toBe(4600);

    try {
      await pool.query(
        "UPDATE storage_rate SET rate_minor = rate_minor * 10 WHERE size_code = 'SMALL'",
      );

      clock.current = new Date(PLUS_7_DAYS);
      const second = await store('SMALL', 'S-2');
      clock.current = new Date(PLUS_14_DAYS);
      const res = await retrieve(second.lockerId, second.pickupCode).expect(
        200,
      );

      expect(res.body.storageFee.amountMinor).toBe(46000);
      expect(await snapshottedFee(first.packageId)).toBe(4600);
    } finally {
      await pool.query(
        "UPDATE storage_rate SET rate_minor = rate_minor / 10 WHERE size_code = 'SMALL'",
      );
    }
  });
});
