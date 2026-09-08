import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'mysql2/promise';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { MYSQL_POOL } from '../src/shared/database/mysql.pool.js';
import { SEEDED_STATION_ID } from './seeded-station.js';

/**
 * The two package listings: the customer's own parcels (`GET /packages/mine`)
 * and the operator's search across every customer (`GET /packages`). The point
 * the suite exists to hold down is the first one's scoping — a customer must
 * never be able to reach another customer's parcels, whatever they send.
 */

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

describe('Package listings (e2e)', () => {
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
    await pool.query('DELETE FROM locker_assignment');
    await pool.query('DELETE FROM package');
    await pool.query('DELETE FROM locker');
    await pool.query('DELETE FROM locker_station WHERE id <> :id', {
      id: SEEDED_STATION_ID,
    });
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

  /** A customer's token carries their customer id as its subject. */
  const customerToken = (customerId: string) => token('CUSTOMER', customerId);

  function createLocker(
    op: string,
    code: string,
    size: string,
    stationId: string = SEEDED_STATION_ID,
  ) {
    return http()
      .post('/lockers')
      .set('authorization', `Bearer ${op}`)
      .send({ code, size, stationId });
  }

  async function registerPackage(
    agent: string,
    customerId: string,
    size = 'SMALL',
    trackingRef?: string,
  ): Promise<string> {
    const res = await http()
      .post('/packages')
      .set('authorization', `Bearer ${agent}`)
      .send(
        trackingRef === undefined
          ? { size, customerId }
          : { size, customerId, trackingRef },
      )
      .expect(201);
    return res.body.packageId as string;
  }

  async function storePackage(
    agent: string,
    packageId: string,
    stationId: string = SEEDED_STATION_ID,
  ) {
    const res = await http()
      .post(`/packages/${packageId}/store`)
      .set('authorization', `Bearer ${agent}`)
      .send({ stationId })
      .expect(200);
    return res.body as {
      lockerId: string;
      lockerCode: string;
      pickupCode: string;
    };
  }

  const ids = (body: { items: { id: string }[] }) =>
    body.items.map((p) => p.id);

  describe("a customer's own parcels", () => {
    it('answers only the caller’s parcels, newest first', async () => {
      const op = await token('OPERATOR');
      const agent = await token('AGENT');
      await createLocker(op, 'A-01', 'SMALL').expect(201);

      const alice1 = await registerPackage(agent, ALICE);
      const bobs = await registerPackage(agent, BOB);
      const alice2 = await registerPackage(agent, ALICE);

      const mine = await http()
        .get('/packages/mine')
        .set('authorization', `Bearer ${await customerToken(ALICE)}`)
        .expect(200);

      expect(mine.body).toMatchObject({ total: 2, limit: 50, offset: 0 });
      // Newest first, and Bob's parcel is nowhere in it.
      expect(ids(mine.body)).toEqual([alice2, alice1]);
      expect(ids(mine.body)).not.toContain(bobs);
      expect(
        mine.body.items.every(
          (p: { customerId: string }) => p.customerId === ALICE,
        ),
      ).toBe(true);
    });

    it('cannot be pointed at another customer', async () => {
      const agent = await token('AGENT');
      await registerPackage(agent, BOB);
      const alice = await customerToken(ALICE);

      // The query has no customerId to set, and sending one is a 400 rather
      // than a silently ignored parameter.
      await http()
        .get(`/packages/mine?customerId=${BOB}`)
        .set('authorization', `Bearer ${alice}`)
        .expect(400);

      const mine = await http()
        .get('/packages/mine')
        .set('authorization', `Bearer ${alice}`)
        .expect(200);
      expect(mine.body).toMatchObject({ items: [], total: 0 });
    });

    it('reports where the parcel is and what the stay cost, but never the pickup code', async () => {
      const op = await token('OPERATOR');
      const agent = await token('AGENT');
      await createLocker(op, 'A-01', 'SMALL').expect(201);
      const packageId = await registerPackage(agent, ALICE, 'SMALL', 'TRK-9');
      const stored = await storePackage(agent, packageId);

      const mine = await http()
        .get('/packages/mine')
        .set('authorization', `Bearer ${await customerToken(ALICE)}`)
        .expect(200);

      expect(mine.body.items[0]).toMatchObject({
        id: packageId,
        status: 'STORED',
        size: 'SMALL',
        trackingRef: 'TRK-9',
        lockerId: stored.lockerId,
        lockerCode: 'A-01',
        stationId: SEEDED_STATION_ID,
        stationName: 'Default Station',
        // Charged on collection, so not yet.
        storageFee: null,
        retrievedAt: null,
      });
      expect(typeof mine.body.items[0].storedAt).toBe('string');

      const body = JSON.stringify(mine.body);
      expect(body).not.toContain(stored.pickupCode);
      expect(body).not.toMatch(/pickup|hash/i);
    });

    it('prices the stay once the parcel is collected', async () => {
      const op = await token('OPERATOR');
      const agent = await token('AGENT');
      const alice = await customerToken(ALICE);
      await createLocker(op, 'A-01', 'SMALL').expect(201);
      const packageId = await registerPackage(agent, ALICE);
      const stored = await storePackage(agent, packageId);

      // Collected at the station, not from the app.
      await http()
        .post('/packages/retrieve')
        .set('authorization', `Bearer ${await token('STATION')}`)
        .send({ lockerId: stored.lockerId, pickupCode: stored.pickupCode })
        .expect(200);

      const mine = await http()
        .get('/packages/mine')
        .set('authorization', `Bearer ${alice}`)
        .expect(200);

      expect(mine.body.items[0]).toMatchObject({
        id: packageId,
        status: 'RETRIEVED',
        storageFee: { amountMinor: 0, currency: 'AUD' },
      });
      expect(typeof mine.body.items[0].retrievedAt).toBe('string');
    });

    it('pages and filters', async () => {
      const agent = await token('AGENT');
      const alice = await customerToken(ALICE);
      for (const size of ['SMALL', 'MEDIUM', 'LARGE']) {
        await registerPackage(agent, ALICE, size);
      }

      const firstPage = await http()
        .get('/packages/mine?limit=2')
        .set('authorization', `Bearer ${alice}`)
        .expect(200);
      expect(firstPage.body).toMatchObject({ total: 3, limit: 2, offset: 0 });
      expect(firstPage.body.items).toHaveLength(2);

      const secondPage = await http()
        .get('/packages/mine?limit=2&offset=2')
        .set('authorization', `Bearer ${alice}`)
        .expect(200);
      expect(secondPage.body.items).toHaveLength(1);
      expect(ids(secondPage.body)[0]).not.toBe(ids(firstPage.body)[0]);

      const large = await http()
        .get('/packages/mine?size=LARGE')
        .set('authorization', `Bearer ${alice}`)
        .expect(200);
      expect(large.body.total).toBe(1);

      const registered = await http()
        .get('/packages/mine?status=REGISTERED&sortBy=registeredAt&sortDir=asc')
        .set('authorization', `Bearer ${alice}`)
        .expect(200);
      expect(registered.body.total).toBe(3);
    });
  });

  describe("the operator's search", () => {
    it('spans every customer and filters by one', async () => {
      const op = await token('OPERATOR');
      const agent = await token('AGENT');
      const alices = await registerPackage(agent, ALICE);
      const bobs = await registerPackage(agent, BOB);

      const all = await http()
        .get('/packages')
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(all.body.total).toBe(2);
      expect(ids(all.body)).toEqual([bobs, alices]);

      const justBob = await http()
        .get(`/packages?customerId=${BOB}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(ids(justBob.body)).toEqual([bobs]);
    });

    it('filters by status, size, tracking reference, station and locker', async () => {
      const op = await token('OPERATOR');
      const agent = await token('AGENT');
      await createLocker(op, 'A-01', 'SMALL').expect(201);

      const stayed = await registerPackage(agent, ALICE, 'SMALL', 'TRK-1');
      const stored = await storePackage(agent, stayed);
      const neverStored = await registerPackage(agent, BOB, 'LARGE', 'TRK-2');

      const list = (query: string) =>
        http()
          .get(`/packages${query}`)
          .set('authorization', `Bearer ${op}`)
          .expect(200);

      expect(ids((await list('?status=STORED')).body)).toEqual([stayed]);
      expect(ids((await list('?status=REGISTERED')).body)).toEqual([
        neverStored,
      ]);
      expect(ids((await list('?size=LARGE')).body)).toEqual([neverStored]);
      expect(ids((await list('?trackingRef=TRK-1')).body)).toEqual([stayed]);
      expect(ids((await list(`?lockerId=${stored.lockerId}`)).body)).toEqual([
        stayed,
      ]);

      // A station filter is about where a parcel sits, so one that was never
      // stored matches no station at all.
      const atStation = await list(`?stationId=${SEEDED_STATION_ID}`);
      expect(ids(atStation.body)).toEqual([stayed]);
    });

    it('sorts by when a parcel was stored', async () => {
      const op = await token('OPERATOR');
      const agent = await token('AGENT');
      await createLocker(op, 'A-01', 'SMALL').expect(201);
      await createLocker(op, 'A-02', 'SMALL').expect(201);

      const first = await registerPackage(agent, ALICE);
      await storePackage(agent, first);
      const second = await registerPackage(agent, BOB);
      await storePackage(agent, second);

      const ascending = await http()
        .get('/packages?status=STORED&sortBy=storedAt&sortDir=asc')
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(ids(ascending.body)).toEqual([first, second]);

      const descending = await http()
        .get('/packages?status=STORED&sortBy=storedAt&sortDir=desc')
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(ids(descending.body)).toEqual([second, first]);
    });

    it('rejects a window or a sort it does not offer', async () => {
      const op = await token('OPERATOR');
      const list = (query: string) =>
        http().get(`/packages${query}`).set('authorization', `Bearer ${op}`);

      await list('?limit=0').expect(400);
      await list('?limit=500').expect(400);
      await list('?offset=-1').expect(400);
      await list('?sortBy=pickupCodeHash').expect(400);
      await list('?sortDir=sideways').expect(400);
      await list('?customerId=not-a-uuid').expect(400);
      await list('?status=LOST').expect(400);
    });
  });

  it('keeps the two listings to their own roles', async () => {
    const op = await token('OPERATOR');
    const agent = await token('AGENT');
    const alice = await customerToken(ALICE);

    // The operator's search is not a customer's to run...
    await http()
      .get('/packages')
      .set('authorization', `Bearer ${alice}`)
      .expect(403);
    await http()
      .get('/packages')
      .set('authorization', `Bearer ${agent}`)
      .expect(403);

    // ...and "mine" means nothing for an operator.
    await http()
      .get('/packages/mine')
      .set('authorization', `Bearer ${op}`)
      .expect(403);

    await http().get('/packages').expect(401);
    await http().get('/packages/mine').expect(401);
  });
});
