import type { Clock } from '../../shared/clock/clock.js';
import {
  LockerCodeTakenError,
  LockerDecommissionedError,
  LockerNotFoundError,
} from '../domain/errors.js';
import { Locker } from '../domain/locker.entity.js';
import { LockerSize } from '../domain/locker-size.js';
import type { LockerRepository } from '../domain/locker.repository.js';
import { UpdateLockerService } from './update-locker.service.js';

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

function build(opts: { locker?: Locker | null; taken?: string[] } = {}) {
  const locker = opts.locker === undefined ? aLocker() : opts.locker;
  const written: Locker[] = [];
  const lockers = {
    findByIdWithOccupancy: async () =>
      locker ? { locker, activePackageId: null, station } : null,
    existsByStationAndCode: async (_stationId: string, code: string) =>
      (opts.taken ?? []).includes(code),
    update: async (updated: Locker) => {
      written.push(updated);
    },
  } as unknown as LockerRepository;
  return { written, service: new UpdateLockerService(lockers, clock) };
}

describe('UpdateLockerService', () => {
  it('renames the locker and stamps updated_at from the clock', async () => {
    const { service, written } = build();

    const view = await service.updateLocker({ id: 'l-1', code: 'A-99' });

    expect(view.code).toBe('A-99');
    expect(written).toHaveLength(1);
    expect(written[0].updatedAt.toISOString()).toBe('2026-06-02T09:00:00.000Z');
    expect(written[0].createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('takes a locker out of service without touching its code', async () => {
    const { service, written } = build();

    const view = await service.updateLocker({
      id: 'l-1',
      status: 'OUT_OF_SERVICE',
    });

    expect(view.status).toBe('OUT_OF_SERVICE');
    expect(written[0].code).toBe('A-01');
  });

  it('rejects a code already used at the same station', async () => {
    const { service, written } = build({ taken: ['B-02'] });

    await expect(
      service.updateLocker({ id: 'l-1', code: 'B-02' }),
    ).rejects.toThrow(LockerCodeTakenError);
    expect(written).toHaveLength(0);
  });

  it('allows a no-op rename to the locker’s own code', async () => {
    const { service } = build({ taken: ['A-01'] });

    const view = await service.updateLocker({ id: 'l-1', code: 'A-01' });

    expect(view.code).toBe('A-01');
  });

  it('throws when the locker is unknown', async () => {
    const { service } = build({ locker: null });

    await expect(
      service.updateLocker({ id: 'nope', code: 'X' }),
    ).rejects.toThrow(LockerNotFoundError);
  });

  it('refuses to edit a decommissioned locker', async () => {
    const retired = aLocker().decommission(new Date('2026-05-01T00:00:00Z'));
    const { service, written } = build({ locker: retired });

    await expect(
      service.updateLocker({ id: 'l-1', status: 'IN_SERVICE' }),
    ).rejects.toThrow(LockerDecommissionedError);
    expect(written).toHaveLength(0);
  });
});
