import type { Clock } from '../../shared/clock/clock.js';
import type { IdGenerator } from '../../shared/id/id-generator.js';
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

  async findById(id: string): Promise<Locker | null> {
    return this.saved.find((l) => l.id === id) ?? null;
  }

  async existsByStationAndCode(
    stationId: string,
    code: string,
  ): Promise<boolean> {
    return this.keys.has(`${stationId}:${code}`);
  }

  async listWithOccupancy(): Promise<LockerOccupancy[]> {
    return this.saved.map((locker) => ({
      locker,
      activePackageId: null,
      station: { id: locker.stationId, name: 'Test Station', location: null },
    }));
  }

  async findAvailableSmallestFit(): Promise<Locker | null> {
    return null;
  }
}

const clock: Clock = { now: () => new Date('2026-06-01T12:00:00.000Z') };

function idGen(): IdGenerator {
  let n = 0;
  return { next: () => `id-${++n}` };
}

describe('CreateLockerService', () => {
  it('persists with a generated id and clock timestamps', async () => {
    const repo = new FakeLockerRepository();
    const locker = await new CreateLockerService(
      repo,
      idGen(),
      clock,
    ).createLocker({ code: 'A-01', size: 'MEDIUM' });

    expect(locker.id).toBe('id-1');
    expect(locker.createdAt.toISOString()).toBe('2026-06-01T12:00:00.000Z');
    expect(locker.updatedAt).toEqual(locker.createdAt);
    expect(repo.saved).toHaveLength(1);
  });

  it('defaults to the seeded station when none is given', async () => {
    const locker = await new CreateLockerService(
      new FakeLockerRepository(),
      idGen(),
      clock,
    ).createLocker({ code: 'B-02', size: 'SMALL' });

    expect(locker.stationId).toBe(DEFAULT_STATION_ID);
  });

  it('rejects a duplicate (station, code)', async () => {
    const service = new CreateLockerService(
      new FakeLockerRepository(),
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
      new CreateLockerService(repo, idGen(), clock).createLocker({
        code: 'C',
        size: 'HUGE',
      }),
    ).rejects.toThrow(/Unknown locker size/);
    expect(repo.saved).toHaveLength(0);
  });
});
