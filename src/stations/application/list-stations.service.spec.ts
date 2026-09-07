import { LockerStation } from '../domain/locker-station.entity.js';
import type {
  ListStationsFilter,
  StationRepository,
} from '../domain/station.repository.js';
import { ListStationsService } from './list-stations.service.js';

const station = LockerStation.create({
  id: 's-1',
  name: 'Central',
  now: new Date('2026-01-01T00:00:00.000Z'),
});

describe('ListStationsService', () => {
  it('returns what the repository gives it', async () => {
    const stations = {
      list: async () => [station],
    } as unknown as StationRepository;

    expect(await new ListStationsService(stations).listStations()).toEqual([
      station,
    ]);
  });

  it('passes the includeDecommissioned filter through', async () => {
    let received: ListStationsFilter | undefined;
    const stations = {
      list: async (filter: ListStationsFilter) => {
        received = filter;
        return [];
      },
    } as unknown as StationRepository;

    await new ListStationsService(stations).listStations({
      includeDecommissioned: true,
    });

    expect(received).toEqual({ includeDecommissioned: true });
  });
});
