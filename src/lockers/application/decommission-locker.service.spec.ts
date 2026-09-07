import type { Clock } from '../../shared/clock/clock.js';
import {
  LockerDecommissionedError,
  LockerNotFoundError,
  LockerOccupiedError,
} from '../domain/errors.js';
import { Locker } from '../domain/locker.entity.js';
import { LockerSize } from '../domain/locker-size.js';
import type { LockerRepository } from '../domain/locker.repository.js';
import { DecommissionLockerService } from './decommission-locker.service.js';

const clock: Clock = { now: () => new Date('2026-06-02T09:00:00.000Z') };
const station = { id: 'station-1', name: 'HQ Bank', location: 'Lobby' };

function aLocker(): Locker {
  return Locker.create({
    id: 'l-1',
    stationId: 'station-1',
    code: 'A-01',
    size: LockerSize.of('SMALL'),
    now: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function build(
  opts: { locker?: Locker | null; activePackageId?: string | null } = {},
) {
  const locker = opts.locker === undefined ? aLocker() : opts.locker;
  const written: Locker[] = [];
  const lockers = {
    findByIdWithOccupancy: async () =>
      locker
        ? {
            locker,
            activePackageId: opts.activePackageId ?? null,
            station,
          }
        : null,
    update: async (updated: Locker) => {
      written.push(updated);
    },
  } as unknown as LockerRepository;
  return { written, service: new DecommissionLockerService(lockers, clock) };
}

describe('DecommissionLockerService', () => {
  it('retires an empty locker and keeps the row', async () => {
    const { service, written } = build();

    const view = await service.decommissionLocker('l-1');

    expect(view.status).toBe('DECOMMISSIONED');
    expect(view.availability).toBe('FREE');
    expect(written).toHaveLength(1);
    expect(written[0].updatedAt.toISOString()).toBe('2026-06-02T09:00:00.000Z');
  });

  it('refuses while a package is still inside', async () => {
    const { service, written } = build({ activePackageId: 'pkg-7' });

    await expect(service.decommissionLocker('l-1')).rejects.toThrow(
      LockerOccupiedError,
    );
    expect(written).toHaveLength(0);
  });

  it('throws when the locker is unknown', async () => {
    const { service } = build({ locker: null });

    await expect(service.decommissionLocker('nope')).rejects.toThrow(
      LockerNotFoundError,
    );
  });

  it('refuses to retire the same locker twice', async () => {
    const retired = aLocker().decommission(new Date('2026-05-01T00:00:00Z'));
    const { service, written } = build({ locker: retired });

    await expect(service.decommissionLocker('l-1')).rejects.toThrow(
      LockerDecommissionedError,
    );
    expect(written).toHaveLength(0);
  });
});
