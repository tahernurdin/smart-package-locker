import type { Clock } from '../../shared/clock/clock.js';
import {
  StationDecommissionedError,
  StationNotFoundError,
} from '../domain/errors.js';
import { LockerStation } from '../domain/locker-station.entity.js';
import type { StationRepository } from '../domain/station.repository.js';
import { UpdateStationService } from './update-station.service.js';

const clock: Clock = { now: () => new Date('2026-06-02T09:00:00.000Z') };

function aStation(): LockerStation {
  return LockerStation.create({
    id: 's-1',
    name: 'Central',
    location: 'Level 2',
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function build(station: LockerStation | null = aStation()) {
  const written: LockerStation[] = [];
  const stations = {
    findById: async () => station,
    update: async (updated: LockerStation) => {
      written.push(updated);
    },
  } as unknown as StationRepository;
  return { written, service: new UpdateStationService(stations, clock) };
}

describe('UpdateStationService', () => {
  it('renames the station and stamps updated_at from the clock', async () => {
    const { service, written } = build();

    const station = await service.updateStation('s-1', { name: 'North' });

    expect(station.name).toBe('North');
    expect(station.location).toBe('Level 2');
    expect(station.updatedAt.toISOString()).toBe('2026-06-02T09:00:00.000Z');
    expect(written).toEqual([station]);
  });

  it('clears the location on an explicit null', async () => {
    const { service } = build();
    const station = await service.updateStation('s-1', { location: null });
    expect(station.location).toBeNull();
  });

  it('leaves omitted fields alone', async () => {
    const { service } = build();
    const station = await service.updateStation('s-1', {});
    expect(station.name).toBe('Central');
    expect(station.location).toBe('Level 2');
  });

  it('throws when the station is unknown', async () => {
    const { service } = build(null);

    await expect(service.updateStation('nope', { name: 'X' })).rejects.toThrow(
      StationNotFoundError,
    );
  });

  it('refuses to edit a decommissioned station', async () => {
    const retired = aStation().decommission(new Date('2026-05-01T00:00:00Z'));
    const { service, written } = build(retired);

    await expect(
      service.updateStation('s-1', { name: 'North' }),
    ).rejects.toThrow(StationDecommissionedError);
    expect(written).toHaveLength(0);
  });
});
