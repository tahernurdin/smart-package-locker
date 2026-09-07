import { LockerNotFoundError } from '../domain/errors.js';
import { Locker } from '../domain/locker.entity.js';
import { LockerSize } from '../domain/locker-size.js';
import type { LockerRepository } from '../domain/locker.repository.js';
import { GetLockerService } from './get-locker.service.js';

const station = { id: 'station-1', name: 'HQ Bank', location: 'Lobby' };

const theLocker = Locker.create({
  id: 'l-1',
  stationId: 'station-1',
  code: 'A-01',
  size: LockerSize.of('SMALL'),
  now: new Date('2026-01-01T00:00:00.000Z'),
});

function service(
  activePackageId: string | null,
  found = true,
): GetLockerService {
  const lockers = {
    findByIdWithOccupancy: async () =>
      found ? { locker: theLocker, activePackageId, station } : null,
  } as unknown as LockerRepository;
  return new GetLockerService(lockers);
}

describe('GetLockerService', () => {
  it('returns the locker with its occupancy and station flattened on', async () => {
    expect(await service(null).getLocker('l-1')).toEqual({
      id: 'l-1',
      code: 'A-01',
      size: 'SMALL',
      status: 'IN_SERVICE',
      availability: 'FREE',
      activePackageId: null,
      stationId: 'station-1',
      stationName: 'HQ Bank',
      location: 'Lobby',
    });
  });

  it('reports OCCUPIED when a package is inside', async () => {
    const view = await service('pkg-7').getLocker('l-1');
    expect(view.availability).toBe('OCCUPIED');
    expect(view.activePackageId).toBe('pkg-7');
  });

  it('throws when the locker is unknown', async () => {
    await expect(service(null, false).getLocker('nope')).rejects.toThrow(
      LockerNotFoundError,
    );
  });
});
