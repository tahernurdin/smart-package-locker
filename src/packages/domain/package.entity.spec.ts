import { LockerSize } from '../../lockers/domain/locker-size.js';
import { PackageAlreadyRetrievedError } from './errors.js';
import { Package } from './package.entity.js';
import { PickupCode } from './pickup-code.js';

function storedPackage() {
  return Package.storeNew({
    id: 'p-1',
    lockerId: 'l-1',
    customerId: 'c-1',
    size: LockerSize.of('SMALL'),
    pickupCodeHash: 'hash',
    now: new Date('2026-06-01T00:00:00.000Z'),
  });
}

describe('Package.storeNew', () => {
  it('starts active, with storedAt from the clock and no fee yet', () => {
    const now = new Date('2026-06-01T09:00:00.000Z');
    const pkg = Package.storeNew({
      id: 'p-1',
      lockerId: 'l-1',
      customerId: 'c-1',
      size: LockerSize.of('SMALL'),
      pickupCodeHash: 'hash',
      now,
    });

    expect(pkg.storedAt).toBe(now);
    expect(pkg.retrievedAt).toBeNull();
    expect(pkg.storageFeeMinor).toBeNull();
    expect(pkg.isActive).toBe(true);
    expect(pkg.trackingRef).toBeNull();
  });
});

describe('Package.retrieve', () => {
  it('returns a retrieved copy and leaves the original active', () => {
    const stored = storedPackage();
    const retrieved = stored.retrieve({
      now: new Date('2026-06-03T00:00:00.000Z'),
      storageFeeMinor: 1200,
    });

    expect(stored.isActive).toBe(true);
    expect(retrieved.isActive).toBe(false);
    expect(retrieved.retrievedAt?.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    expect(retrieved.storageFeeMinor).toBe(1200);
  });

  it('rejects retrieving a package twice', () => {
    const retrieved = storedPackage().retrieve({
      now: new Date('2026-06-03T00:00:00.000Z'),
      storageFeeMinor: 0,
    });
    expect(() =>
      retrieved.retrieve({ now: new Date('2026-06-04T00:00:00Z'), storageFeeMinor: 0 }),
    ).toThrow(PackageAlreadyRetrievedError);
  });

  it('clamps retrievedAt to storedAt when the clock is behind', () => {
    const stored = storedPackage();
    const retrieved = stored.retrieve({
      now: new Date('2026-05-01T00:00:00Z'),
      storageFeeMinor: 0,
    });
    expect(retrieved.retrievedAt).toEqual(stored.storedAt);
  });
});

describe('PickupCode', () => {
  it('accepts a 6-digit string, leading zeros included', () => {
    expect(PickupCode.of('001234').value).toBe('001234');
  });

  it('rejects anything that is not 6 digits', () => {
    expect(() => PickupCode.of('12345')).toThrow();
    expect(() => PickupCode.of('1234567')).toThrow();
    expect(() => PickupCode.of('12x456')).toThrow();
  });
});
