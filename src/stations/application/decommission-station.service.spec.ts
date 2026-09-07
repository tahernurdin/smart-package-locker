import type { Clock } from '../../shared/clock/clock.js';
import {
  StationDecommissionedError,
  StationNotEmptyError,
  StationNotFoundError,
} from '../domain/errors.js';
import { LockerStation } from '../domain/locker-station.entity.js';
import type { StationRepository } from '../domain/station.repository.js';
import { DecommissionStationService } from './decommission-station.service.js';

const clock: Clock = { now: () => new Date('2026-06-02T09:00:00.000Z') };

function aStation(): LockerStation {
  return LockerStation.create({
    id: 's-1',
    name: 'Central',
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function build(
  opts: { station?: LockerStation | null; liveLockers?: number } = {},
) {
  const station = opts.station === undefined ? aStation() : opts.station;
  const written: LockerStation[] = [];
  const stations = {
    findById: async () => station,
    countLiveLockers: async () => opts.liveLockers ?? 0,
    update: async (updated: LockerStation) => {
      written.push(updated);
    },
  } as unknown as StationRepository;
  return { written, service: new DecommissionStationService(stations, clock) };
}

describe('DecommissionStationService', () => {
  it('retires an empty station and keeps the row', async () => {
    const { service, written } = build();

    const station = await service.decommissionStation('s-1');

    expect(station.status).toBe('DECOMMISSIONED');
    expect(station.updatedAt.toISOString()).toBe('2026-06-02T09:00:00.000Z');
    expect(written).toEqual([station]);
  });

  it('refuses while lockers still stand there', async () => {
    const { service, written } = build({ liveLockers: 3 });

    await expect(service.decommissionStation('s-1')).rejects.toThrow(
      StationNotEmptyError,
    );
    expect(written).toHaveLength(0);
  });

  it('throws when the station is unknown', async () => {
    const { service } = build({ station: null });

    await expect(service.decommissionStation('nope')).rejects.toThrow(
      StationNotFoundError,
    );
  });

  it('refuses to retire the same station twice', async () => {
    const retired = aStation().decommission(new Date('2026-05-01T00:00:00Z'));
    const { service, written } = build({ station: retired });

    await expect(service.decommissionStation('s-1')).rejects.toThrow(
      StationDecommissionedError,
    );
    expect(written).toHaveLength(0);
  });
});
