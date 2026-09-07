import type { Clock } from '../../shared/clock/clock.js';
import type { IdGenerator } from '../../shared/id/id-generator.js';
import {
  StationDecommissionedError,
  StationNotFoundError,
} from '../../stations/domain/errors.js';
import { LockerStation } from '../../stations/domain/locker-station.entity.js';
import type { StationRepository } from '../../stations/domain/station.repository.js';
import { LockerCodeTakenError } from '../domain/errors.js';
import type { Locker } from '../domain/locker.entity.js';
import type {
  LockerOccupancy,
  LockerRepository,
} from '../domain/locker.repository.js';
import {
  CreateLockerService,
  DEFAULT_STATION_ID,
} from './create-locker.service.js';

class FakeLockerRepository implements LockerRepository {
  readonly saved: Locker[] = [];
  private readonly keys = new Set<string>();

  async save(locker: Locker): Promise<void> {
    const key = `${locker.stationId}:${locker.code}`;
    if (this.keys.has(key)) {
      throw new LockerCodeTakenError(locker.stationId, locker.code);
    }
    this.keys.add(key);
    this.saved.push(locker);
  }

  async update(locker: Locker): Promise<void> {
    this.saved[this.saved.findIndex((l) => l.id === locker.id)] = locker;
  }

  async findById(id: string): Promise<Locker | null> {
    return this.saved.find((l) => l.id === id) ?? null;
  }

  async findByIdWithOccupancy(id: string): Promise<LockerOccupancy | null> {
    const locker = await this.findById(id);
    return locker ? this.occupancy(locker) : null;
  }

  async existsByStationAndCode(
    stationId: string,
    code: string,
  ): Promise<boolean> {
    return this.keys.has(`${stationId}:${code}`);
  }

  async listWithOccupancy(): Promise<LockerOccupancy[]> {
    return this.saved.map((locker) => this.occupancy(locker));
  }

  private occupancy(locker: Locker): LockerOccupancy {
    return {
      locker,
      activePackageId: null,
      station: { id: locker.stationId, name: 'Test Station', location: null },
    };
  }
}

const clock: Clock = { now: () => new Date('2026-06-01T12:00:00.000Z') };

const theStation = LockerStation.create({
  id: DEFAULT_STATION_ID,
  name: 'Test Station',
  location: 'HQ',
  now: new Date('2026-01-01T00:00:00.000Z'),
});

function stations(
  station: LockerStation | null = theStation,
): StationRepository {
  return { findById: async () => station } as unknown as StationRepository;
}

function idGen(): IdGenerator {
  let n = 0;
  return { next: () => `id-${++n}` };
}

describe('CreateLockerService', () => {
  it('persists with a generated id and clock timestamps', async () => {
    const repo = new FakeLockerRepository();
    const view = await new CreateLockerService(
      repo,
      stations(),
      idGen(),
      clock,
    ).createLocker({ code: 'A-01', size: 'MEDIUM' });

    expect(view.id).toBe('id-1');
    expect(view.availability).toBe('FREE');
    expect(view.stationName).toBe('Test Station');
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0].createdAt.toISOString()).toBe(
      '2026-06-01T12:00:00.000Z',
    );
    expect(repo.saved[0].updatedAt).toEqual(repo.saved[0].createdAt);
  });

  it('defaults to the seeded station when none is given', async () => {
    const repo = new FakeLockerRepository();
    const view = await new CreateLockerService(
      repo,
      stations(),
      idGen(),
      clock,
    ).createLocker({ code: 'B-02', size: 'SMALL' });

    expect(view.stationId).toBe(DEFAULT_STATION_ID);
    expect(repo.saved[0].stationId).toBe(DEFAULT_STATION_ID);
  });

  it('rejects a duplicate (station, code)', async () => {
    const service = new CreateLockerService(
      new FakeLockerRepository(),
      stations(),
      idGen(),
      clock,
    );
    await service.createLocker({ code: 'A-01', size: 'SMALL' });

    await expect(
      service.createLocker({ code: 'A-01', size: 'LARGE' }),
    ).rejects.toThrow(LockerCodeTakenError);
  });

  it('rejects an unknown size before touching the repository', async () => {
    const repo = new FakeLockerRepository();
    await expect(
      new CreateLockerService(repo, stations(), idGen(), clock).createLocker({
        code: 'C',
        size: 'HUGE',
      }),
    ).rejects.toThrow(/Unknown locker size/);
    expect(repo.saved).toHaveLength(0);
  });

  it('rejects an unknown station instead of letting the FK fail', async () => {
    const repo = new FakeLockerRepository();
    await expect(
      new CreateLockerService(
        repo,
        stations(null),
        idGen(),
        clock,
      ).createLocker({
        code: 'C-01',
        size: 'SMALL',
        stationId: DEFAULT_STATION_ID,
      }),
    ).rejects.toThrow(StationNotFoundError);
    expect(repo.saved).toHaveLength(0);
  });

  it('refuses to add a locker to a decommissioned station', async () => {
    const repo = new FakeLockerRepository();
    const retired = theStation.decommission(new Date('2026-02-01T00:00:00Z'));

    await expect(
      new CreateLockerService(
        repo,
        stations(retired),
        idGen(),
        clock,
      ).createLocker({ code: 'C-01', size: 'SMALL' }),
    ).rejects.toThrow(StationDecommissionedError);
    expect(repo.saved).toHaveLength(0);
  });
});
