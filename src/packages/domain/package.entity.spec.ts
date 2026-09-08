import { LockerSize } from '../../lockers/domain/locker-size.js';
import {
  PackageAlreadyRetrievedError,
  PackageAlreadyStoredError,
} from './errors.js';
import { Package } from './package.entity.js';
import { PickupCode } from './pickup-code.js';

const REGISTERED_AT = new Date('2026-06-01T00:00:00.000Z');

function registered() {
  return Package.register({
    id: 'p-1',
    customerId: 'c-1',
    size: LockerSize.of('SMALL'),
    trackingRef: 'TRK-1',
    now: REGISTERED_AT,
  });
}

function stored(at = new Date('2026-06-02T00:00:00.000Z')) {
  return registered().storeInLocker({
    assignmentId: 'a-1',
    lockerId: 'l-1',
    pickupCodeHash: 'hash',
    storedByAgent: 'agent-9',
    now: at,
  });
}

describe('Package.register', () => {
  it('starts REGISTERED with no assignment', () => {
    const pkg = registered();
    expect(pkg.status).toBe('REGISTERED');
    expect(pkg.assignment).toBeNull();
    expect(pkg.createdAt).toEqual(REGISTERED_AT);
  });
});

describe('Package.belongsTo', () => {
  it('recognises only the customer it was registered for', () => {
    const pkg = stored();
    expect(pkg.belongsTo('c-1')).toBe(true);
    expect(pkg.belongsTo('c-2')).toBe(false);
  });
});

describe('Package.storeInLocker', () => {
  it('REGISTERED -> STORED and opens an active assignment', () => {
    const pkg = stored();
    expect(pkg.status).toBe('STORED');
    expect(pkg.lockerId).toBe('l-1');
    expect(pkg.pickupCodeHash).toBe('hash');
    expect(pkg.assignment?.isActive).toBe(true);
    expect(pkg.assignment?.storedByAgent).toBe('agent-9');
  });

  it('rejects storing a package that is not REGISTERED', () => {
    expect(() =>
      stored().storeInLocker({
        assignmentId: 'a-2',
        lockerId: 'l-2',
        pickupCodeHash: 'h2',
        now: new Date(),
      }),
    ).toThrow(PackageAlreadyStoredError);
  });

  it('does not mutate the original', () => {
    const pkg = registered();
    pkg.storeInLocker({
      assignmentId: 'a-1',
      lockerId: 'l-1',
      pickupCodeHash: 'hash',
      now: new Date(),
    });
    expect(pkg.status).toBe('REGISTERED');
    expect(pkg.assignment).toBeNull();
  });
});

describe('Package.retrieve', () => {
  it('STORED -> RETRIEVED and closes the assignment with the fee', () => {
    const out = stored().retrieve({
      now: new Date('2026-06-05T00:00:00.000Z'),
      storageFeeMinor: 1200,
    });
    expect(out.status).toBe('RETRIEVED');
    expect(out.assignment?.isActive).toBe(false);
    expect(out.assignment?.storageFeeMinor).toBe(1200);
    expect(out.retrievedAt?.toISOString()).toBe('2026-06-05T00:00:00.000Z');
  });

  it('rejects retrieving twice', () => {
    const out = stored().retrieve({
      now: new Date('2026-06-05T00:00:00.000Z'),
      storageFeeMinor: 0,
    });
    expect(() =>
      out.retrieve({ now: new Date('2026-06-06T00:00:00Z'), storageFeeMinor: 0 }),
    ).toThrow(PackageAlreadyRetrievedError);
  });

  it('rejects retrieving a package that was never stored', () => {
    expect(() =>
      registered().retrieve({ now: new Date(), storageFeeMinor: 0 }),
    ).toThrow(PackageAlreadyRetrievedError);
  });

  it('clamps retrievedAt to storedAt when the clock is behind', () => {
    const pkg = stored(new Date('2026-06-02T00:00:00.000Z'));
    const out = pkg.retrieve({
      now: new Date('2026-05-01T00:00:00Z'),
      storageFeeMinor: 0,
    });
    expect(out.retrievedAt).toEqual(pkg.storedAt);
  });
});

describe('PickupCode', () => {
  it('accepts a 6-digit code', () => {
    expect(PickupCode.of('012345').value).toBe('012345');
  });

  it('rejects anything that is not 6 digits', () => {
    expect(() => PickupCode.of('12345')).toThrow();
    expect(() => PickupCode.of('1234567')).toThrow();
    expect(() => PickupCode.of('12a456')).toThrow();
  });
});
