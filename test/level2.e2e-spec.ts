import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { MYSQL_POOL } from '../src/shared/database/mysql.pool.js';
import { SEEDED_STATION_ID } from './seeded-station.js';

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
    // See level1.e2e-spec.ts: a listening server is required for the concurrent
    // batches below, or supertest closes the socket between requests.
    await app.listen(0);
    pool = app.get<Pool>(MYSQL_POOL);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM locker_assignment');
    await pool.query('DELETE FROM package');
    await pool.query('DELETE FROM locker');
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function token(role: string, sub?: string): Promise<string> {
    const res = await http()
      .post('/auth/dev-token')
      .send(sub === undefined ? { role } : { role, sub })
      .expect(201);
    return res.body.token as string;
  }

  // A customer id as it would arrive from the upstream customer service.
  const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

  /**
   * Retrieval is called by the locker station, not by the customer: the person
   * at the keypad has no session, and the pickup code is what identifies them.
   */
  const stationToken = () => token('STATION');

  async function registerAndStore(agent: string, size: string, code = 'A-01') {
    const registered = await http()
      .post('/packages')
      .set('authorization', `Bearer ${agent}`)
      .send({ size, customerId: CUSTOMER_ID })
      .expect(201);
    const stored = await http()
      .post(`/packages/${registered.body.packageId}/store`)
      .send({ stationId: SEEDED_STATION_ID })
      .set('authorization', `Bearer ${agent}`)
      .expect(200);
    return {
      lockerId: stored.body.lockerId as string,
      pickupCode: stored.body.pickupCode as string,
      packageId: stored.body.packageId as string,
      lockerCode: code,
    };
  }

  async function seedStoredPackage() {
    const op = await token('OPERATOR');
    const agent = await token('AGENT');
    await http()
      .post('/lockers')
      .set('authorization', `Bearer ${op}`)
      .send({ code: 'A-01', size: 'MEDIUM', stationId: SEEDED_STATION_ID })
      .expect(201);
    return { op, agent, ...(await registerAndStore(agent, 'MEDIUM')) };
  }

  it('retrieves a package, returns a fee-0 confirmation, and frees the locker', async () => {
    const { op, agent, lockerId, pickupCode, packageId } =
      await seedStoredPackage();
    const station = await stationToken();

    const res = await http()
      .post('/packages/retrieve')
      .set('authorization', `Bearer ${station}`)
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
      lockers.body.items.find((l: { code: string }) => l.code === 'A-01'),
    ).toMatchObject({ availability: 'FREE', activePackageId: null });

    // the freed locker takes a new package
    await registerAndStore(agent, 'MEDIUM');
  });

  it('rejects every invalid retrieval the same way', async () => {
    const { lockerId, pickupCode } = await seedStoredPackage();
    const station = await stationToken();
    const retrieve = (body: Record<string, string>) =>
      http()
        .post('/packages/retrieve')
        .set('authorization', `Bearer ${station}`)
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

  it('blocks a door after five wrong codes at it', async () => {
    const { lockerId, pickupCode } = await seedStoredPackage();
    const station = await stationToken();
    const attempt = (code: string) =>
      http()
        .post('/packages/retrieve')
        .set('authorization', `Bearer ${station}`)
        .send({ lockerId, pickupCode: code });

    // Six candidates so that dropping the one that happens to be the real code
    // still leaves five wrong ones.
    const wrong = ['100000', '100001', '100002', '100003', '100004', '100005']
      .filter((c) => c !== pickupCode)
      .slice(0, 5);
    for (const code of wrong) await attempt(code).expect(404);

    const blocked = await attempt('999999').expect(429);
    expect(blocked.body.code).toBe('too_many_retrieval_attempts');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // The right code is refused too — that is the point of the block.
    await attempt(pickupCode).expect(429);
  });

  it('does not spend the budget on failures that are not code guesses', async () => {
    const { lockerId, pickupCode } = await seedStoredPackage();
    const station = await stationToken();

    // Ten refusals that are not guesses at this door's code: a locker id that
    // does not exist. Counting those would let a mistyped id freeze a locker
    // with someone's parcel in it.
    for (let i = 0; i < 10; i++) {
      await http()
        .post('/packages/retrieve')
        .set('authorization', `Bearer ${station}`)
        .send({
          lockerId: '0a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
          pickupCode: '123456',
        })
        .expect(404);
    }

    // and the parcel still comes out normally
    await http()
      .post('/packages/retrieve')
      .set('authorization', `Bearer ${station}`)
      .send({ lockerId, pickupCode })
      .expect(200);
  });

  it('enforces role and authentication', async () => {
    const { agent, lockerId, pickupCode } = await seedStoredPackage();

    await http()
      .post('/packages/retrieve')
      .set('authorization', `Bearer ${agent}`)
      .send({ lockerId, pickupCode })
      .expect(403);

    // A customer token opens nothing either: doors are opened at the station,
    // and the app's job ends at telling its owner which one to walk to.
    await http()
      .post('/packages/retrieve')
      .set('authorization', `Bearer ${await token('CUSTOMER', CUSTOMER_ID)}`)
      .send({ lockerId, pickupCode })
      .expect(403);

    await http()
      .post('/packages/retrieve')
      .send({ lockerId, pickupCode })
      .expect(401);
  });

  it('re-issues a code to the parcel owner, killing the old one', async () => {
    const { lockerId, pickupCode, packageId } = await seedStoredPackage();
    const station = await stationToken();
    const customer = await token('CUSTOMER', CUSTOMER_ID);

    // The customer lost the SMS and asks their own app for another code.
    const reissued = await http()
      .post(`/packages/${packageId}/pickup-code`)
      .set('authorization', `Bearer ${customer}`)
      .expect(200);
    expect(reissued.body).toMatchObject({ packageId, lockerId, lockerCode: 'A-01' });
    expect(reissued.body.pickupCode).toMatch(/^\d{6}$/);
    expect(reissued.body.pickupCode).not.toBe(pickupCode);

    // The old code is worthless from that moment...
    await http()
      .post('/packages/retrieve')
      .set('authorization', `Bearer ${station}`)
      .send({ lockerId, pickupCode })
      .expect(404);

    // ...and the new one opens the same locker.
    await http()
      .post('/packages/retrieve')
      .set('authorization', `Bearer ${station}`)
      .send({ lockerId, pickupCode: reissued.body.pickupCode })
      .expect(200);
  });

  it('re-issues only to the parcel’s own customer', async () => {
    const { packageId } = await seedStoredPackage();

    const stranger = await token(
      'CUSTOMER',
      '22222222-2222-4222-8222-222222222222',
    );
    const refused = await http()
      .post(`/packages/${packageId}/pickup-code`)
      .set('authorization', `Bearer ${stranger}`)
      .expect(404);
    expect(refused.body.code).toBe('pickup_code_reissue_failed');

    // Not the station's call either: the cabinet knows a door, not a person.
    await http()
      .post(`/packages/${packageId}/pickup-code`)
      .set('authorization', `Bearer ${await stationToken()}`)
      .expect(403);
  });

  it('refuses a new code once the parcel is out of the locker', async () => {
    const { lockerId, pickupCode, packageId } = await seedStoredPackage();
    const customer = await token('CUSTOMER', CUSTOMER_ID);

    await http()
      .post('/packages/retrieve')
      .set('authorization', `Bearer ${await stationToken()}`)
      .send({ lockerId, pickupCode })
      .expect(200);

    const refused = await http()
      .post(`/packages/${packageId}/pickup-code`)
      .set('authorization', `Bearer ${customer}`)
      .expect(409);
    expect(refused.body.code).toBe('package_not_stored');
  });

  it('stops giving one parcel codes once its window is spent', async () => {
    const { packageId } = await seedStoredPackage();
    const customer = await token('CUSTOMER', CUSTOMER_ID);
    const reissue = () =>
      http()
        .post(`/packages/${packageId}/pickup-code`)
        .set('authorization', `Bearer ${customer}`);

    // The count is never given back — three codes is three codes, however the
    // parcel got there.
    for (let i = 0; i < 3; i++) await reissue().expect(200);

    const blocked = await reissue().expect(429);
    expect(blocked.body.code).toBe('too_many_pickup_code_reissues');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('lets a new code lift the block five wrong guesses put on the door', async () => {
    const { lockerId, pickupCode, packageId } = await seedStoredPackage();
    const station = await stationToken();
    const customer = await token('CUSTOMER', CUSTOMER_ID);
    const attempt = (code: string) =>
      http()
        .post('/packages/retrieve')
        .set('authorization', `Bearer ${station}`)
        .send({ lockerId, pickupCode: code });

    const wrong = ['100000', '100001', '100002', '100003', '100004', '100005']
      .filter((c) => c !== pickupCode)
      .slice(0, 5);
    for (const code of wrong) await attempt(code).expect(404);
    await attempt(pickupCode).expect(429);

    // Someone else's guessing must not strand the owner in front of their own
    // locker: a new code makes those guesses meaningless and reopens the door.
    const reissued = await http()
      .post(`/packages/${packageId}/pickup-code`)
      .set('authorization', `Bearer ${customer}`)
      .expect(200);

    await attempt(reissued.body.pickupCode).expect(200);
  });

  it('retrieves a package at most once under concurrent requests', async () => {
    const { lockerId, pickupCode } = await seedStoredPackage();
    const station = await stationToken();

    const statuses = await Promise.all(
      Array.from({ length: 6 }, () =>
        http()
          .post('/packages/retrieve')
          .set('authorization', `Bearer ${station}`)
          .send({ lockerId, pickupCode })
          .then((r) => r.status),
      ),
    );

    expect(statuses.filter((s) => s === 200)).toHaveLength(1);

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS count FROM locker_assignment WHERE retrieved_at IS NOT NULL',
    );
    expect(Number(rows[0].count)).toBe(1);
  });
});
