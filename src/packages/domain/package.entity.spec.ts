import { LockerSize } from '../../lockers/domain/locker-size.js';
import { Package } from './package.entity.js';
import { PickupCode } from './pickup-code.js';

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
