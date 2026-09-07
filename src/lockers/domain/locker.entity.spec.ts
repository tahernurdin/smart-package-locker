import { InvalidLockerCodeError, LockerDecommissionedError } from './errors.js';
import { Locker } from './locker.entity.js';
import { LockerSize } from './locker-size.js';

const CREATED = new Date('2026-01-01T00:00:00.000Z');
const LATER = new Date('2026-06-01T00:00:00.000Z');

function aLocker(): Locker {
  return Locker.create({
    id: 'l-1',
    stationId: 'station-1',
    code: '  A-01  ',
    size: LockerSize.of('MEDIUM'),
    now: CREATED,
  });
}

describe('Locker', () => {
  it('trims the code and opens in service', () => {
    const locker = aLocker();
    expect(locker.code).toBe('A-01');
    expect(locker.status).toBe('IN_SERVICE');
    expect(locker.isServiceable()).toBe(true);
  });

  it('rejects a blank code', () => {
    expect(() =>
      Locker.create({
        id: 'l-2',
        stationId: 'station-1',
        code: '   ',
        size: LockerSize.of('SMALL'),
        now: CREATED,
      }),
    ).toThrow(InvalidLockerCodeError);
  });

  it('returns a new instance on update, leaving the original alone', () => {
    const locker = aLocker();
    const updated = locker.update({ code: 'B-02', now: LATER });

    expect(updated).not.toBe(locker);
    expect(locker.code).toBe('A-01');
    expect(updated.code).toBe('B-02');
    expect(updated.createdAt).toEqual(CREATED);
    expect(updated.updatedAt).toEqual(LATER);
  });

  it('keeps size and station fixed for life', () => {
    const updated = aLocker().update({ code: 'B-02', now: LATER });
    expect(updated.size.code).toBe('MEDIUM');
    expect(updated.stationId).toBe('station-1');
  });

  it('treats decommissioning as terminal', () => {
    const retired = aLocker().decommission(LATER);

    expect(retired.status).toBe('DECOMMISSIONED');
    expect(retired.isServiceable()).toBe(false);
    expect(() => retired.decommission(LATER)).toThrow(
      LockerDecommissionedError,
    );
    expect(() => retired.update({ status: 'IN_SERVICE', now: LATER })).toThrow(
      LockerDecommissionedError,
    );
  });
});
