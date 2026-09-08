import { Locker } from '../../lockers/domain/locker.entity.js';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import type { LockerRepository } from '../../lockers/domain/locker.repository.js';
import type { AppConfiguration } from '../../shared/config/configuration.js';
import { PickupCodeHasher } from '../../shared/pickup-code/pickup-code-hasher.js';
import {
  InvalidPickupCodeError,
  PackageAlreadyRetrievedError,
  PackageNotFoundForRetrievalError,
  TooManyRetrievalAttemptsError,
} from '../domain/errors.js';
import { Package } from '../domain/package.entity.js';
import type { PackageRepository } from '../domain/package.repository.js';
import type { StorageFeePolicy } from '../domain/storage-fee.policy.js';
import { RetrievePackageService } from './retrieve-package.service.js';

const CODE = '482913';
const CUSTOMER = 'c-1';
const hasher = new PickupCodeHasher({ pickupCodePepper: '' } as AppConfiguration);
const config = { currency: 'AUD' } as AppConfiguration;

function theLocker() {
  return Locker.create({
    id: 'l-1',
    stationId: 'station-1',
    code: 'A-01',
    size: LockerSize.of('SMALL'),
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

function activePackage(code = CODE, customerId = CUSTOMER) {
  return Package.register({
    id: 'p-1',
    customerId,
    size: LockerSize.of('SMALL'),
    now: new Date('2026-05-30T00:00:00.000Z'),
  }).storeInLocker({
    assignmentId: 'a-1',
    lockerId: 'l-1',
    pickupCodeHash: hasher.hash(code),
    now: new Date('2026-06-01T00:00:00.000Z'),
  });
}

/**
 * Counts in memory what the Redis adapter counts in Redis, against the same
 * per-locker key, so the service's use of the port is exercised without one.
 */
function fakeLimiter(opts: { blockFor?: number } = {}) {
  const failures = new Map<string, number>();
  return {
    failures,
    check: vi.fn(async () =>
      opts.blockFor ? { retryAfterSeconds: opts.blockFor } : null,
    ),
    recordFailure: vi.fn(async (lockerId: string) => {
      failures.set(lockerId, (failures.get(lockerId) ?? 0) + 1);
    }),
    clear: vi.fn(async (lockerId: string) => {
      failures.delete(lockerId);
    }),
  };
}

function build(opts: {
  locker?: Locker | null;
  pkg?: Package | null;
  fee?: number;
  now?: Date;
  blockFor?: number;
}) {
  const saveRetrieval = vi.fn(async (_pkg: Package) => undefined);
  const lockers = {
    findById: async () => opts.locker ?? null,
  } as unknown as LockerRepository;
  const packages = {
    findActiveByLocker: async () =>
      opts.pkg === undefined ? activePackage() : opts.pkg,
    saveRetrieval,
  } as unknown as PackageRepository;
  const feePolicy: StorageFeePolicy = { calculate: async () => opts.fee ?? 0 };
  const clock = { now: () => opts.now ?? new Date('2026-06-05T00:00:00.000Z') };
  const attempts = fakeLimiter({ blockFor: opts.blockFor });

  return {
    saveRetrieval,
    attempts,
    service: new RetrievePackageService(
      lockers,
      packages,
      feePolicy,
      hasher,
      clock,
      config,
      attempts,
    ),
  };
}

describe('RetrievePackageService', () => {
  it('retrieves the package, records it once, and returns the confirmation', async () => {
    const { service, saveRetrieval } = build({
      locker: theLocker(),
      pkg: activePackage(),
      fee: 0,
    });

    const result = await service.retrieve({
      lockerId: 'l-1',
      pickupCode: CODE,
    });

    expect(result).toEqual({
      packageId: 'p-1',
      lockerId: 'l-1',
      lockerCode: 'A-01',
      retrievedAt: new Date('2026-06-05T00:00:00.000Z'),
      storageFee: { amountMinor: 0, currency: 'AUD' },
      opened: true,
    });
    expect(saveRetrieval).toHaveBeenCalledTimes(1);
    expect(saveRetrieval.mock.calls[0]?.[0].assignment?.storageFeeMinor).toBe(
      0,
    );
  });

  it('passes the fee from the policy straight through', async () => {
    const { service, saveRetrieval } = build({
      locker: theLocker(),
      pkg: activePackage(),
      fee: 1500,
    });

    const result = await service.retrieve({
      lockerId: 'l-1',
      pickupCode: CODE,
    });

    expect(result.storageFee.amountMinor).toBe(1500);
    expect(saveRetrieval.mock.calls[0]?.[0].assignment?.storageFeeMinor).toBe(
      1500,
    );
  });

  it('fails the same way for an unknown locker, no active package, or a wrong code', async () => {
    const unknownLocker = build({ locker: null });
    await expect(
      unknownLocker.service.retrieve({
        lockerId: 'l-1',
        pickupCode: CODE,
      }),
    ).rejects.toThrow(PackageNotFoundForRetrievalError);

    const empty = build({ locker: theLocker(), pkg: null });
    await expect(
      empty.service.retrieve({ lockerId: 'l-1', pickupCode: CODE }),
    ).rejects.toThrow(PackageNotFoundForRetrievalError);

    const wrongCode = build({ locker: theLocker(), pkg: activePackage() });
    await expect(
      wrongCode.service.retrieve({
        lockerId: 'l-1',
        pickupCode: '000000',
      }),
    ).rejects.toThrow(PackageNotFoundForRetrievalError);
  });

  it('does not record a retrieval when the code is wrong', async () => {
    const { service, saveRetrieval } = build({
      locker: theLocker(),
      pkg: activePackage(),
    });
    await expect(
      service.retrieve({ lockerId: 'l-1', pickupCode: '111111' }),
    ).rejects.toThrow();
    expect(saveRetrieval).not.toHaveBeenCalled();
  });

  it('rejects a malformed pickup code', async () => {
    const { service } = build({ locker: theLocker(), pkg: activePackage() });
    await expect(
      service.retrieve({ lockerId: 'l-1', pickupCode: '12' }),
    ).rejects.toThrow(InvalidPickupCodeError);
  });
});

describe('RetrievePackageService attempt limiting', () => {
  it('counts every wrong code at one door against that door', async () => {
    const { service, attempts } = build({
      locker: theLocker(),
      pkg: activePackage(),
    });

    await expect(
      service.retrieve({ lockerId: 'l-1', pickupCode: '000000' }),
    ).rejects.toThrow(PackageNotFoundForRetrievalError);
    await expect(
      service.retrieve({ lockerId: 'l-1', pickupCode: '111111' }),
    ).rejects.toThrow(PackageNotFoundForRetrievalError);

    expect(attempts.failures.get('l-1')).toBe(2);
  });

  it('counts nothing when the failure was not a guess at a code', async () => {
    // An unknown locker and an emptied one are mistakes, not guesses — an
    // honest customer must not burn their budget on either.
    const unknownLocker = build({ locker: null });
    await expect(
      unknownLocker.service.retrieve({
        lockerId: 'l-9',
        pickupCode: CODE,
      }),
    ).rejects.toThrow(PackageNotFoundForRetrievalError);
    expect(unknownLocker.attempts.recordFailure).not.toHaveBeenCalled();

    const empty = build({ locker: theLocker(), pkg: null });
    await expect(
      empty.service.retrieve({ lockerId: 'l-1', pickupCode: CODE }),
    ).rejects.toThrow(PackageNotFoundForRetrievalError);
    expect(empty.attempts.recordFailure).not.toHaveBeenCalled();
  });

  it('counts against the locker that was tried, and nothing else', async () => {
    const { service, attempts } = build({
      locker: theLocker(),
      pkg: activePackage(),
    });

    await expect(
      service.retrieve({ lockerId: 'l-1', pickupCode: '000000' }),
    ).rejects.toThrow();

    expect(attempts.recordFailure).toHaveBeenCalledWith('l-1');
    expect(attempts.failures.size).toBe(1);
  });

  it('turns a blocked caller away before looking anything up', async () => {
    const { service, attempts, saveRetrieval } = build({
      locker: theLocker(),
      pkg: activePackage(),
      blockFor: 900,
    });

    // Correct code, still refused, and the refusal carries how long to wait.
    await expect(
      service.retrieve({ lockerId: 'l-1', pickupCode: CODE }),
    ).rejects.toMatchObject({
      code: 'too_many_retrieval_attempts',
      kind: 'rate_limited',
      retryAfterSeconds: 900,
    });

    expect(saveRetrieval).not.toHaveBeenCalled();
    // Being turned away is not itself an attempt: it must not refresh the
    // block, or a client that keeps retrying would never be let back in.
    expect(attempts.recordFailure).not.toHaveBeenCalled();
  });

  it('refuses a blocked caller even when the pickup code is malformed', async () => {
    // The 422 would otherwise answer a caller who is supposed to be turned away.
    const { service } = build({
      locker: theLocker(),
      pkg: activePackage(),
      blockFor: 30,
    });
    await expect(
      service.retrieve({ lockerId: 'l-1', pickupCode: '12' }),
    ).rejects.toThrow(TooManyRetrievalAttemptsError);
  });

  it('forgets the attempts once the parcel is collected', async () => {
    const { service, attempts } = build({
      locker: theLocker(),
      pkg: activePackage(),
    });
    await service.retrieve({ lockerId: 'l-1', pickupCode: CODE });
    expect(attempts.clear).toHaveBeenCalledWith('l-1');
  });

  it('does not count losing a concurrent race as a failed attempt', async () => {
    // `saveRetrieval` rejecting means another request collected the parcel
    // first. Nothing was guessed, so nothing is counted.
    const { service, attempts, saveRetrieval } = build({
      locker: theLocker(),
      pkg: activePackage(),
    });
    saveRetrieval.mockRejectedValueOnce(new PackageAlreadyRetrievedError());

    await expect(
      service.retrieve({ lockerId: 'l-1', pickupCode: CODE }),
    ).rejects.toThrow(PackageAlreadyRetrievedError);
    expect(attempts.recordFailure).not.toHaveBeenCalled();
  });
});
