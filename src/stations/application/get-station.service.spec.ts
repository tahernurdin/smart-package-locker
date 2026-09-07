import { StationNotFoundError } from '../domain/errors.js';
import { LockerStation } from '../domain/locker-station.entity.js';
import type { StationRepository } from '../domain/station.repository.js';
import { GetStationService } from './get-station.service.js';

const station = LockerStation.create({
  id: 's-1',
  name: 'Central',
  now: new Date('2026-01-01T00:00:00.000Z'),
});

function service(found: LockerStation | null): GetStationService {
  return new GetStationService({
    findById: async () => found,
  } as unknown as StationRepository);
}

describe('GetStationService', () => {
  it('returns the station', async () => {
    expect(await service(station).getStation('s-1')).toBe(station);
  });

  it('throws when the station is unknown', async () => {
    await expect(service(null).getStation('nope')).rejects.toThrow(
      StationNotFoundError,
    );
  });

  it('still returns a decommissioned station when asked for by id', async () => {
    const retired = station.decommission(new Date('2026-06-01T00:00:00.000Z'));
    expect((await service(retired).getStation('s-1')).status).toBe(
      'DECOMMISSIONED',
    );
  });
});
