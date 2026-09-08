import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'mysql2/promise';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { MYSQL_POOL } from '../src/shared/database/mysql.pool.js';
import { SEEDED_STATION_ID } from './seeded-station.js';

/**
 * Operator management of stations and lockers: the full CRUD on both, and the
 * rules that hold the two together — a locker needs a live station, and neither
 * is ever hard-deleted (decommissioning is terminal and keeps the row, so the
 * assignment history keeps its referent).
 */

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const UNKNOWN_UUID = '0a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

describe('Locker & station management (e2e)', () => {
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
    // The seeded station is shared with the other suites — leave it as found.
    await pool.query(
      `UPDATE locker_station SET status = 'ACTIVE' WHERE id = :id`,
      { id: SEEDED_STATION_ID },
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function token(role: string): Promise<string> {
    const res = await http().post('/auth/dev-token').send({ role }).expect(201);
    return res.body.token as string;
  }

  async function createStation(
    op: string,
    name: string,
    location?: string,
  ): Promise<string> {
    const res = await http()
      .post('/stations')
      .set('authorization', `Bearer ${op}`)
      .send(location === undefined ? { name } : { name, location })
      .expect(201);
    return res.body.id as string;
  }

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

  describe('stations', () => {
    it('creates, reads, lists, updates and decommissions a station', async () => {
      const op = await token('OPERATOR');

      const created = await http()
        .post('/stations')
        .set('authorization', `Bearer ${op}`)
        .send({ name: 'North Depot', location: 'Level 2' })
        .expect(201);
      expect(created.body).toMatchObject({
        name: 'North Depot',
        location: 'Level 2',
        status: 'ACTIVE',
      });
      const id = created.body.id as string;

      const fetched = await http()
        .get(`/stations/${id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(fetched.body).toEqual(created.body);

      const listed = await http()
        .get('/stations')
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(listed.body.map((s: { id: string }) => s.id)).toContain(id);

      const patched = await http()
        .patch(`/stations/${id}`)
        .set('authorization', `Bearer ${op}`)
        .send({ name: 'North Hub' })
        .expect(200);
      expect(patched.body.name).toBe('North Hub');
      expect(patched.body.location).toBe('Level 2');

      const deleted = await http()
        .delete(`/stations/${id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(deleted.body.status).toBe('DECOMMISSIONED');
    });

    it('hides a decommissioned station from the list unless asked', async () => {
      const op = await token('OPERATOR');
      const id = await createStation(op, 'Temporary');
      await http()
        .delete(`/stations/${id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);

      const listed = await http()
        .get('/stations')
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(listed.body.map((s: { id: string }) => s.id)).not.toContain(id);

      const withRetired = await http()
        .get('/stations?includeDecommissioned=true')
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(withRetired.body.map((s: { id: string }) => s.id)).toContain(id);

      // Fetching one by id still works — the row is retained, not erased.
      await http()
        .get(`/stations/${id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);
    });

    it('refuses to decommission a station that still has lockers', async () => {
      const op = await token('OPERATOR');
      const stationId = await createStation(op, 'Busy');
      const locker = await createLocker(op, 'N-01', 'SMALL', stationId).expect(
        201,
      );

      const refused = await http()
        .delete(`/stations/${stationId}`)
        .set('authorization', `Bearer ${op}`)
        .expect(409);
      expect(refused.body.code).toBe('station_not_empty');

      // Retire the locker and the station follows.
      await http()
        .delete(`/lockers/${locker.body.id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      await http()
        .delete(`/stations/${stationId}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);
    });

    it('refuses to edit or re-retire a decommissioned station', async () => {
      const op = await token('OPERATOR');
      const id = await createStation(op, 'Gone');
      await http()
        .delete(`/stations/${id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);

      const edit = await http()
        .patch(`/stations/${id}`)
        .set('authorization', `Bearer ${op}`)
        .send({ name: 'Back' })
        .expect(409);
      expect(edit.body.code).toBe('station_decommissioned');

      await http()
        .delete(`/stations/${id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(409);
    });

    it('404s an unknown station and 400s a malformed id', async () => {
      const op = await token('OPERATOR');

      const missing = await http()
        .get(`/stations/${UNKNOWN_UUID}`)
        .set('authorization', `Bearer ${op}`)
        .expect(404);
      expect(missing.body.code).toBe('station_not_found');

      await http()
        .get('/stations/not-a-uuid')
        .set('authorization', `Bearer ${op}`)
        .expect(400);
      await http()
        .post('/stations')
        .set('authorization', `Bearer ${op}`)
        .send({ name: '' })
        .expect(400);
    });

    it('is operator-only', async () => {
      const agent = await token('AGENT');
      await http()
        .get('/stations')
        .set('authorization', `Bearer ${agent}`)
        .expect(403);
      await http().get('/stations').expect(401);
    });
  });

  describe('lockers', () => {
    it('requires an explicit stationId — there is no default station', async () => {
      const op = await token('OPERATOR');
      const agent = await token('AGENT');

      await http()
        .post('/lockers')
        .set('authorization', `Bearer ${op}`)
        .send({ code: 'NO-STATION', size: 'SMALL' })
        .expect(400);

      // Storing is the same: the agent says which station they are standing at.
      await createLocker(op, 'S-01', 'SMALL').expect(201);
      const registered = await http()
        .post('/packages')
        .set('authorization', `Bearer ${agent}`)
        .send({ size: 'SMALL', customerId: CUSTOMER_ID })
        .expect(201);

      await http()
        .post(`/packages/${registered.body.packageId}/store`)
        .set('authorization', `Bearer ${agent}`)
        .expect(400);

      await http()
        .post(`/packages/${registered.body.packageId}/store`)
        .set('authorization', `Bearer ${agent}`)
        .send({ stationId: SEEDED_STATION_ID })
        .expect(200);
    });

    it('tells an agent the station is unknown rather than "no locker fits"', async () => {
      const op = await token('OPERATOR');
      const agent = await token('AGENT');
      await createLocker(op, 'S-01', 'SMALL').expect(201);

      const registered = await http()
        .post('/packages')
        .set('authorization', `Bearer ${agent}`)
        .send({ size: 'SMALL', customerId: CUSTOMER_ID })
        .expect(201);

      const unknown = await http()
        .post(`/packages/${registered.body.packageId}/store`)
        .set('authorization', `Bearer ${agent}`)
        .send({ stationId: UNKNOWN_UUID })
        .expect(404);
      expect(unknown.body.code).toBe('station_not_found');

      // A retired station is a different answer again, not a silent miss.
      const retiredId = await createStation(op, 'Closing Soon');
      await http()
        .delete(`/stations/${retiredId}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);

      const retired = await http()
        .post(`/packages/${registered.body.packageId}/store`)
        .set('authorization', `Bearer ${agent}`)
        .send({ stationId: retiredId })
        .expect(409);
      expect(retired.body.code).toBe('station_decommissioned');

      // The parcel is untouched by either rejection — still storable.
      await http()
        .post(`/packages/${registered.body.packageId}/store`)
        .set('authorization', `Bearer ${agent}`)
        .send({ stationId: SEEDED_STATION_ID })
        .expect(200);
    });

    it('rejects a locker at an unknown station instead of failing on the FK', async () => {
      const op = await token('OPERATOR');

      const res = await createLocker(op, 'X-01', 'SMALL', UNKNOWN_UUID).expect(
        404,
      );
      expect(res.body.code).toBe('station_not_found');
    });

    it('rejects a locker at a decommissioned station', async () => {
      const op = await token('OPERATOR');
      const stationId = await createStation(op, 'Closing');
      await http()
        .delete(`/stations/${stationId}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);

      const res = await createLocker(op, 'X-01', 'SMALL', stationId).expect(
        409,
      );
      expect(res.body.code).toBe('station_decommissioned');
    });

    it('reads one locker by id with its occupancy and station', async () => {
      const op = await token('OPERATOR');
      const created = await createLocker(op, 'R-01', 'MEDIUM').expect(201);

      const fetched = await http()
        .get(`/lockers/${created.body.id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(fetched.body).toMatchObject({
        code: 'R-01',
        size: 'MEDIUM',
        status: 'IN_SERVICE',
        availability: 'FREE',
        activePackageId: null,
        stationId: SEEDED_STATION_ID,
        stationName: 'Default Station',
      });

      const missing = await http()
        .get(`/lockers/${UNKNOWN_UUID}`)
        .set('authorization', `Bearer ${op}`)
        .expect(404);
      expect(missing.body.code).toBe('locker_not_found');
    });

    it('renames a locker and takes it out of service', async () => {
      const op = await token('OPERATOR');
      const created = await createLocker(op, 'P-01', 'SMALL').expect(201);
      const id = created.body.id as string;

      const renamed = await http()
        .patch(`/lockers/${id}`)
        .set('authorization', `Bearer ${op}`)
        .send({ code: 'P-99' })
        .expect(200);
      expect(renamed.body.code).toBe('P-99');

      const parked = await http()
        .patch(`/lockers/${id}`)
        .set('authorization', `Bearer ${op}`)
        .send({ status: 'OUT_OF_SERVICE' })
        .expect(200);
      expect(parked.body).toMatchObject({
        code: 'P-99',
        status: 'OUT_OF_SERVICE',
      });

      // Size and station are fixed for life, so the DTO rejects them outright.
      await http()
        .patch(`/lockers/${id}`)
        .set('authorization', `Bearer ${op}`)
        .send({ size: 'LARGE' })
        .expect(400);
      // DECOMMISSIONED is reached through DELETE, never a status edit.
      await http()
        .patch(`/lockers/${id}`)
        .set('authorization', `Bearer ${op}`)
        .send({ status: 'DECOMMISSIONED' })
        .expect(400);
    });

    it('rejects a rename onto a code already used at the station', async () => {
      const op = await token('OPERATOR');
      const first = await createLocker(op, 'D-01', 'SMALL').expect(201);
      await createLocker(op, 'D-02', 'SMALL').expect(201);

      const clash = await http()
        .patch(`/lockers/${first.body.id}`)
        .set('authorization', `Bearer ${op}`)
        .send({ code: 'D-02' })
        .expect(409);
      expect(clash.body.code).toBe('locker_code_taken');

      // Renaming to its own code is a no-op, not a clash.
      await http()
        .patch(`/lockers/${first.body.id}`)
        .set('authorization', `Bearer ${op}`)
        .send({ code: 'D-01' })
        .expect(200);
    });

    it('decommissions an empty locker, hiding it and freeing its code', async () => {
      const op = await token('OPERATOR');
      const created = await createLocker(op, 'K-01', 'SMALL').expect(201);
      const id = created.body.id as string;

      const deleted = await http()
        .delete(`/lockers/${id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(deleted.body.status).toBe('DECOMMISSIONED');

      const listed = await http()
        .get('/lockers')
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(listed.body).toEqual({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      const withRetired = await http()
        .get('/lockers?includeDecommissioned=true')
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(withRetired.body.items.map((l: { id: string }) => l.id)).toEqual([
        id,
      ]);

      // Asking for the retired status outright shows them too — the default
      // hide would otherwise make ?status=DECOMMISSIONED always empty.
      const byStatus = await http()
        .get('/lockers?status=DECOMMISSIONED')
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(byStatus.body.items.map((l: { id: string }) => l.id)).toEqual([
        id,
      ]);

      // Terminal: no edits, no second retirement.
      await http()
        .patch(`/lockers/${id}`)
        .set('authorization', `Bearer ${op}`)
        .send({ status: 'IN_SERVICE' })
        .expect(409);
      await http()
        .delete(`/lockers/${id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(409);
    });

    it('refuses to decommission a locker that still holds a package', async () => {
      const op = await token('OPERATOR');
      const agent = await token('AGENT');
      await createLocker(op, 'H-01', 'SMALL').expect(201);

      const registered = await http()
        .post('/packages')
        .set('authorization', `Bearer ${agent}`)
        .send({ size: 'SMALL', customerId: CUSTOMER_ID })
        .expect(201);
      const stored = await http()
        .post(`/packages/${registered.body.packageId}/store`)
        .send({ stationId: SEEDED_STATION_ID })
        .set('authorization', `Bearer ${agent}`)
        .expect(200);

      const refused = await http()
        .delete(`/lockers/${stored.body.lockerId}`)
        .set('authorization', `Bearer ${op}`)
        .expect(409);
      expect(refused.body.code).toBe('locker_occupied');

      // Once the customer collects it, the locker can be retired.
      const customer = await token('CUSTOMER');
      await http()
        .post('/packages/retrieve')
        .set('authorization', `Bearer ${customer}`)
        .send({
          lockerId: stored.body.lockerId,
          pickupCode: stored.body.pickupCode,
        })
        .expect(200);
      await http()
        .delete(`/lockers/${stored.body.lockerId}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);
    });

    it('stops allocating a locker once it is out of service or retired', async () => {
      const op = await token('OPERATOR');
      const agent = await token('AGENT');
      const parked = await createLocker(op, 'A-01', 'SMALL').expect(201);
      const retired = await createLocker(op, 'A-02', 'SMALL').expect(201);

      await http()
        .patch(`/lockers/${parked.body.id}`)
        .set('authorization', `Bearer ${op}`)
        .send({ status: 'OUT_OF_SERVICE' })
        .expect(200);
      await http()
        .delete(`/lockers/${retired.body.id}`)
        .set('authorization', `Bearer ${op}`)
        .expect(200);

      const registered = await http()
        .post('/packages')
        .set('authorization', `Bearer ${agent}`)
        .send({ size: 'SMALL', customerId: CUSTOMER_ID })
        .expect(201);
      const stored = await http()
        .post(`/packages/${registered.body.packageId}/store`)
        .send({ stationId: SEEDED_STATION_ID })
        .set('authorization', `Bearer ${agent}`)
        .expect(409);
      expect(stored.body.code).toBe('no_suitable_locker');
    });

    describe('listing', () => {
      /** Seeded out of code order, so the default sort proves it is sorting. */
      async function seedBank(op: string): Promise<void> {
        await createLocker(op, 'C-01', 'LARGE').expect(201);
        await createLocker(op, 'A-02', 'MEDIUM').expect(201);
        await createLocker(op, 'B-03', 'SMALL').expect(201);
        await createLocker(op, 'A-01', 'SMALL').expect(201);
        await createLocker(op, 'D-04', 'MEDIUM').expect(201);
      }

      const list = (op: string, query = '') =>
        http().get(`/lockers${query}`).set('authorization', `Bearer ${op}`);

      const codes = (body: { items: { code: string }[] }) =>
        body.items.map((l) => l.code);

      it('answers one default-sized page, in code order', async () => {
        const op = await token('OPERATOR');
        await seedBank(op);

        const res = await list(op).expect(200);

        expect(res.body).toMatchObject({ total: 5, limit: 50, offset: 0 });
        expect(codes(res.body)).toEqual([
          'A-01',
          'A-02',
          'B-03',
          'C-01',
          'D-04',
        ]);
      });

      it('walks the bank a page at a time, without repeating or dropping one', async () => {
        const op = await token('OPERATOR');
        await seedBank(op);

        const seen: string[] = [];
        for (const offset of [0, 2, 4]) {
          const page = await list(op, `?limit=2&offset=${offset}`).expect(200);
          expect(page.body).toMatchObject({ total: 5, limit: 2, offset });
          seen.push(...page.body.items.map((l: { id: string }) => l.id));
        }
        expect(seen).toHaveLength(5);
        expect(new Set(seen).size).toBe(5);

        // Past the end is an empty page, not an error.
        const beyond = await list(op, '?limit=2&offset=99').expect(200);
        expect(beyond.body).toMatchObject({ items: [], total: 5, offset: 99 });
      });

      it('sorts by a chosen field and direction', async () => {
        const op = await token('OPERATOR');
        await seedBank(op);

        const byCode = await list(op, '?sortBy=code').expect(200);
        expect(codes(byCode.body)).toEqual([
          'A-01',
          'A-02',
          'B-03',
          'C-01',
          'D-04',
        ]);

        const reversed = await list(op, '?sortBy=code&sortDir=desc').expect(
          200,
        );
        expect(codes(reversed.body)).toEqual([
          'D-04',
          'C-01',
          'B-03',
          'A-02',
          'A-01',
        ]);
      });

      it('filters by size, and the total counts matches, not the page', async () => {
        const op = await token('OPERATOR');
        await seedBank(op);

        const small = await list(op, '?size=SMALL').expect(200);
        expect(small.body.total).toBe(2);
        expect(codes(small.body)).toEqual(['A-01', 'B-03']);

        const firstOfTwo = await list(op, '?size=SMALL&limit=1').expect(200);
        expect(firstOfTwo.body).toMatchObject({ total: 2, limit: 1 });
        expect(codes(firstOfTwo.body)).toEqual(['A-01']);
      });

      it('filters by whether the locker holds a package', async () => {
        const op = await token('OPERATOR');
        const agent = await token('AGENT');
        await seedBank(op);

        const registered = await http()
          .post('/packages')
          .set('authorization', `Bearer ${agent}`)
          .send({ size: 'SMALL', customerId: CUSTOMER_ID })
          .expect(201);
        await http()
          .post(`/packages/${registered.body.packageId}/store`)
          .set('authorization', `Bearer ${agent}`)
          .send({ stationId: SEEDED_STATION_ID })
          .expect(200);

        const occupied = await list(op, '?availability=OCCUPIED').expect(200);
        expect(occupied.body.total).toBe(1);
        expect(occupied.body.items[0].activePackageId).toBe(
          registered.body.packageId,
        );

        const free = await list(op, '?availability=FREE').expect(200);
        expect(free.body.total).toBe(4);
      });

      it('rejects a window or a sort it does not offer', async () => {
        const op = await token('OPERATOR');

        await list(op, '?limit=0').expect(400);
        await list(op, '?limit=500').expect(400);
        await list(op, '?limit=abc').expect(400);
        await list(op, '?offset=-1').expect(400);
        await list(op, '?sortBy=stationName').expect(400);
        await list(op, '?sortDir=sideways').expect(400);
        await list(op, '?size=HUGE').expect(400);

        // Filterable, deliberately not sortable — too few values for an order
        // to mean anything. The filters below still answer the same question.
        await list(op, '?sortBy=size').expect(400);
        await list(op, '?sortBy=status').expect(400);
        await list(op, '?sortBy=availability').expect(400);
      });
    });
  });
});
