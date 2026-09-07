import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Pool } from 'mysql2/promise';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { DEFAULT_STATION_ID } from '../src/lockers/application/create-locker.service.js';
import { loadConfiguration } from '../src/shared/config/configuration.js';
import { runMigrations } from '../src/shared/database/migrator.js';
import { MYSQL_POOL } from '../src/shared/database/mysql.pool.js';

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
      id: DEFAULT_STATION_ID,
    });
    // The seeded station is shared with the other suites — leave it as found.
    await pool.query(
      `UPDATE locker_station SET status = 'ACTIVE' WHERE id = :id`,
      { id: DEFAULT_STATION_ID },
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
    stationId?: string,
  ) {
    return http()
      .post('/lockers')
      .set('authorization', `Bearer ${op}`)
      .send(stationId ? { code, size, stationId } : { code, size });
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
        stationId: DEFAULT_STATION_ID,
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
      expect(listed.body).toEqual([]);

      const withRetired = await http()
        .get('/lockers?includeDecommissioned=true')
        .set('authorization', `Bearer ${op}`)
        .expect(200);
      expect(withRetired.body.map((l: { id: string }) => l.id)).toEqual([id]);

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
        .set('authorization', `Bearer ${agent}`)
        .expect(409);
      expect(stored.body.code).toBe('no_suitable_locker');
    });
  });
});
