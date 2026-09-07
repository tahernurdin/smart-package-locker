import { Locker } from '../domain/locker.entity.js';
import { LockerSize } from '../domain/locker-size.js';
import type {
  ListLockersFilter,
  LockerOccupancy,
  LockerRepository,
} from '../domain/locker.repository.js';
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

const station = { id: 'station-1', name: 'HQ Bank', location: 'Lobby' };

describe('ListLockersService', () => {
  it('derives FREE / OCCUPIED and flattens the station onto each row', async () => {
    const repo = {
      listWithOccupancy: async (): Promise<LockerOccupancy[]> => [
        { locker: locker('A-01', 'SMALL'), activePackageId: 'pkg-7', station },
        { locker: locker('B-01', 'LARGE'), activePackageId: null, station },
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
        stationId: 'station-1',
        stationName: 'HQ Bank',
        location: 'Lobby',
      },
      {
        id: 'id-B-01',
        code: 'B-01',
        size: 'LARGE',
        status: 'IN_SERVICE',
        availability: 'FREE',
        activePackageId: null,
        stationId: 'station-1',
        stationName: 'HQ Bank',
        location: 'Lobby',
      },
    ]);
  });

  it('passes the station filter through to the repository', async () => {
    let received: ListLockersFilter | undefined;
    const repo = {
      listWithOccupancy: async (filter?: ListLockersFilter) => {
        received = filter;
        return [];
      },
    } as unknown as LockerRepository;

    await new ListLockersService(repo).listLockers({ stationId: 'station-9' });

    expect(received).toEqual({ stationId: 'station-9' });
  });
});
