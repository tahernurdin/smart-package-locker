import {
  InvalidStationNameError,
  StationDecommissionedError,
} from './errors.js';
import { LockerStation } from './locker-station.entity.js';

const CREATED = new Date('2026-01-01T00:00:00.000Z');
const LATER = new Date('2026-06-01T00:00:00.000Z');

function aStation(): LockerStation {
  return LockerStation.create({
    id: 's-1',
    name: '  Central  ',
    location: '  Level 2  ',
    now: CREATED,
  });
}

describe('LockerStation', () => {
  it('trims its fields and opens active', () => {
    const station = aStation();
    expect(station.name).toBe('Central');
    expect(station.location).toBe('Level 2');
    expect(station.status).toBe('ACTIVE');
    expect(station.isActive()).toBe(true);
  });

  it('normalizes a missing or blank location to null', () => {
    const noLocation = LockerStation.create({
      id: 's-2',
      name: 'X',
      now: CREATED,
    });
    const blank = LockerStation.create({
      id: 's-3',
      name: 'Y',
      location: '   ',
      now: CREATED,
    });

    expect(noLocation.location).toBeNull();
    expect(blank.location).toBeNull();
  });

  it('rejects a blank name, on create and on update', () => {
    expect(() =>
      LockerStation.create({ id: 's-4', name: '  ', now: CREATED }),
    ).toThrow(InvalidStationNameError);
    expect(() => aStation().update({ name: '  ', now: LATER })).toThrow(
      InvalidStationNameError,
    );
  });

  it('returns a new instance on update, leaving the original alone', () => {
    const station = aStation();
    const updated = station.update({ name: 'North', now: LATER });

    expect(updated).not.toBe(station);
    expect(station.name).toBe('Central');
    expect(updated.name).toBe('North');
    expect(updated.location).toBe('Level 2');
    expect(updated.createdAt).toEqual(CREATED);
    expect(updated.updatedAt).toEqual(LATER);
  });

  it('clears the location on an explicit null', () => {
    expect(
      aStation().update({ location: null, now: LATER }).location,
    ).toBeNull();
  });

  it('treats decommissioning as terminal', () => {
    const retired = aStation().decommission(LATER);

    expect(retired.status).toBe('DECOMMISSIONED');
    expect(retired.isActive()).toBe(false);
    expect(() => retired.decommission(LATER)).toThrow(
      StationDecommissionedError,
    );
    expect(() => retired.update({ name: 'North', now: LATER })).toThrow(
      StationDecommissionedError,
    );
  });
});
