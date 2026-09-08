import { Locker } from '../../lockers/domain/locker.entity.js';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import type { LockerRepository } from '../../lockers/domain/locker.repository.js';
import type { AppConfiguration } from '../../shared/config/configuration.js';
import { PickupCodeHasher } from '../../shared/pickup-code/pickup-code-hasher.js';
import {
  PackageAlreadyRetrievedError,
  PackageNotStoredError,
  PickupCodeNotReissuableError,
} from '../domain/errors.js';
import { Package } from '../domain/package.entity.js';
import type { PackageRepository } from '../domain/package.repository.js';
import { ReissuePickupCodeService } from './reissue-pickup-code.service.js';

const OLD_CODE = '482913';
const NEW_CODE = '135790';
const CUSTOMER = 'c-1';
const NOW = new Date('2026-06-05T00:00:00.000Z');
const hasher = new PickupCodeHasher({
  pickupCodePepper: 'test-pepper',
} as AppConfiguration);

function theLocker() {
  return Locker.create({
    id: 'l-1',
    stationId: 'station-1',
    code: 'A-01',
    size: LockerSize.of('SMALL'),
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

function registeredPackage(customerId = CUSTOMER) {
  return Package.register({
    id: 'p-1',
    customerId,
    size: LockerSize.of('SMALL'),
    now: new Date('2026-05-30T00:00:00.000Z'),
  });
}

function storedPackage(customerId = CUSTOMER) {
  return registeredPackage(customerId).storeInLocker({
    assignmentId: 'a-1',
    lockerId: 'l-1',
    pickupCodeHash: hasher.hash(OLD_CODE, 'a-1'),
    now: new Date('2026-06-01T00:00:00.000Z'),
  });
}

function build(opts: { pkg?: Package | null; blockFor?: number } = {}) {
  const savePickupCode = vi.fn(async (_pkg: Package) => undefined);
  const packages = {
    findById: async () => (opts.pkg === undefined ? storedPackage() : opts.pkg),
    savePickupCode,
  } as unknown as PackageRepository;
  const lockers = {
    findById: async () => theLocker(),
  } as unknown as LockerRepository;
  const reissues = {
    check: vi.fn(async () =>
      opts.blockFor ? { retryAfterSeconds: opts.blockFor } : null,
    ),
    recordIssue: vi.fn(async () => undefined),
  };
  const attempts = {
    check: vi.fn(async () => null),
    recordFailure: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };

  return {
    savePickupCode,
    reissues,
    attempts,
    service: new ReissuePickupCodeService(
      packages,
      lockers,
      { generate: () => NEW_CODE },
      hasher,
      { now: () => NOW },
      reissues,
      attempts,
    ),
  };
}

describe('ReissuePickupCodeService', () => {
  it('issues a new code for the caller’s stored parcel and says which locker', async () => {
    const { service, savePickupCode } = build();

    const result = await service.reissue(CUSTOMER, 'p-1');

    expect(result).toEqual({
      packageId: 'p-1',
      lockerId: 'l-1',
      lockerCode: 'A-01',
      pickupCode: NEW_CODE,
      reissuedAt: NOW,
    });
    // Stored as a hash of the new code, never the code itself.
    const saved = savePickupCode.mock.calls[0]?.[0];
    expect(saved?.pickupCodeHash).toBe(hasher.hash(NEW_CODE, 'a-1'));
    expect(saved?.pickupCodeHash).not.toBe(hasher.hash(OLD_CODE, 'a-1'));
  });

  it('leaves the parcel STORED in the same locker', async () => {
    const { service, savePickupCode } = build();
    await service.reissue(CUSTOMER, 'p-1');

    const saved = savePickupCode.mock.calls[0]?.[0];
    expect(saved?.status).toBe('STORED');
    expect(saved?.lockerId).toBe('l-1');
    // The stay is unaffected: a new code must not look like a new drop, or the
    // fee would restart with it.
    expect(saved?.storedAt).toEqual(new Date('2026-06-01T00:00:00.000Z'));
  });

  it('answers the same way for an unknown parcel and someone else’s', async () => {
    const missing = build({ pkg: null });
    await expect(
      missing.service.reissue(CUSTOMER, 'p-9'),
    ).rejects.toThrow(PickupCodeNotReissuableError);

    const stranger = build({ pkg: storedPackage('c-2') });
    await expect(
      stranger.service.reissue(CUSTOMER, 'p-1'),
    ).rejects.toThrow(PickupCodeNotReissuableError);
    expect(stranger.savePickupCode).not.toHaveBeenCalled();
  });

  it('refuses a parcel of the caller’s that is not in a locker', async () => {
    // Their own parcel, so this one may be named: there is no code to re-issue
    // before the agent has dropped it.
    const { service, savePickupCode } = build({ pkg: registeredPackage() });
    await expect(service.reissue(CUSTOMER, 'p-1')).rejects.toThrow(
      PackageNotStoredError,
    );
    expect(savePickupCode).not.toHaveBeenCalled();
  });

  it('spends a re-issue budget that nothing gives back', async () => {
    const { service, reissues, attempts } = build();
    await service.reissue(CUSTOMER, 'p-1');

    expect(reissues.recordIssue).toHaveBeenCalledWith('p-1');
    // The door's wrong-code block is lifted — the guesses that earned it were
    // against a code that no longer exists — but that is a different counter,
    // and it refunds nothing on the re-issue budget.
    expect(attempts.clear).toHaveBeenCalledWith('l-1');
  });

  it('turns a parcel away once it has been given too many codes', async () => {
    const { service, savePickupCode, attempts } = build({ blockFor: 1800 });

    await expect(service.reissue(CUSTOMER, 'p-1')).rejects.toMatchObject({
      code: 'too_many_pickup_code_reissues',
      kind: 'rate_limited',
      retryAfterSeconds: 1800,
    });
    expect(savePickupCode).not.toHaveBeenCalled();
    // Being turned away is not a re-issue, so it lifts no block either — a
    // refused call must not be a way to reopen a door.
    expect(attempts.clear).not.toHaveBeenCalled();
  });

  it('counts and clears nothing when the write loses a race', async () => {
    const { service, savePickupCode, reissues, attempts } = build();
    savePickupCode.mockRejectedValueOnce(new PackageAlreadyRetrievedError());

    await expect(service.reissue(CUSTOMER, 'p-1')).rejects.toThrow(
      PackageAlreadyRetrievedError,
    );
    // The parcel was collected in the meantime: no code reached the customer,
    // so no budget is spent and the door's counter is left exactly as it was.
    expect(reissues.recordIssue).not.toHaveBeenCalled();
    expect(attempts.clear).not.toHaveBeenCalled();
  });
});
