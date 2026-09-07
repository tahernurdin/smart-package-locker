import { Locker } from '../domain/locker.entity.js';
import { LockerSize } from '../domain/locker-size.js';
import type { LockerRepository } from '../domain/locker.repository.js';
import { ListLockersService } from './list-lockers.service.js';

function locker(code: string, size: 'SMALL' | 'MEDIUM' | 'LARGE'): Locker {
  return Locker.create({
    id: `id-${code}`,
    stationId: 'station-1',
    code,
    size: LockerSize.of(size),
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('ListLockersService', () => {
  it('derives FREE / OCCUPIED from the active package', async () => {
    const repo = {
      listWithOccupancy: async () => [
        { locker: locker('A-01', 'SMALL'), activePackageId: 'pkg-7' },
        { locker: locker('B-01', 'LARGE'), activePackageId: null },
      ],
    } as unknown as LockerRepository;

    const views = await new ListLockersService(repo).listLockers();

    expect(views).toEqual([
      {
        id: 'id-A-01',
        code: 'A-01',
        size: 'SMALL',
        status: 'IN_SERVICE',
        availability: 'OCCUPIED',
        activePackageId: 'pkg-7',
      },
      {
        id: 'id-B-01',
        code: 'B-01',
        size: 'LARGE',
        status: 'IN_SERVICE',
        availability: 'FREE',
        activePackageId: null,
      },
    ]);
  });
});
