import type { Clock } from '../../shared/clock/clock.js';
import type { IdGenerator } from '../../shared/id/id-generator.js';
import { InvalidStationNameError } from '../domain/errors.js';
import type { LockerStation } from '../domain/locker-station.entity.js';
import type { StationRepository } from '../domain/station.repository.js';
import { CreateStationService } from './create-station.service.js';

const clock: Clock = { now: () => new Date('2026-06-01T12:00:00.000Z') };

function build() {
  const saved: LockerStation[] = [];
  const stations = {
    save: async (station: LockerStation) => {
      saved.push(station);
    },
  } as unknown as StationRepository;
  const ids: IdGenerator = { next: () => 's-1' };
  return { saved, service: new CreateStationService(stations, ids, clock) };
}

describe('CreateStationService', () => {
  it('persists an active station with a generated id and clock timestamps', async () => {
    const { service, saved } = build();

    const station = await service.createStation({
      name: 'Central',
      location: 'Level 2',
    });

    expect(station.id).toBe('s-1');
    expect(station.status).toBe('ACTIVE');
    expect(station.createdAt.toISOString()).toBe('2026-06-01T12:00:00.000Z');
    expect(station.updatedAt).toEqual(station.createdAt);
    expect(saved).toEqual([station]);
  });

  it('accepts a station with no location', async () => {
    const { service } = build();
    expect(
      (await service.createStation({ name: 'Depot' })).location,
    ).toBeNull();
  });

  it('rejects a blank name before touching the repository', async () => {
    const { service, saved } = build();

    await expect(service.createStation({ name: '   ' })).rejects.toThrow(
      InvalidStationNameError,
    );
    expect(saved).toHaveLength(0);
  });
});
