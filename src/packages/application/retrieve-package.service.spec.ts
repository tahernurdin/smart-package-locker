import { Locker } from '../../lockers/domain/locker.entity.js';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import type { LockerRepository } from '../../lockers/domain/locker.repository.js';
import type { AppConfiguration } from '../../shared/config/configuration.js';
import { PickupCodeHasher } from '../../shared/pickup-code/pickup-code-hasher.js';
import {
  InvalidPickupCodeError,
  PackageNotFoundForRetrievalError,
} from '../domain/errors.js';
import { Package } from '../domain/package.entity.js';
import type { PackageRepository } from '../domain/package.repository.js';
import type { StorageFeePolicy } from '../domain/storage-fee.policy.js';
import { RetrievePackageService } from './retrieve-package.service.js';

const CODE = '482913';
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

function activePackage(code = CODE) {
  return Package.register({
    id: 'p-1',
    customerId: 'c-1',
    size: LockerSize.of('SMALL'),
    now: new Date('2026-05-30T00:00:00.000Z'),
  }).storeInLocker({
    assignmentId: 'a-1',
    lockerId: 'l-1',
    pickupCodeHash: hasher.hash(code),
    now: new Date('2026-06-01T00:00:00.000Z'),
  });
}

function build(opts: {
  locker?: Locker | null;
  pkg?: Package | null;
  fee?: number;
  now?: Date;
}) {
  const saveRetrieval = vi.fn(async () => undefined);
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

  return {
    saveRetrieval,
    service: new RetrievePackageService(
      lockers,
      packages,
      feePolicy,
      hasher,
      clock,
      config,
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

    const result = await service.retrieve({ lockerId: 'l-1', pickupCode: CODE });

    expect(result).toEqual({
      packageId: 'p-1',
      lockerId: 'l-1',
      lockerCode: 'A-01',
      retrievedAt: new Date('2026-06-05T00:00:00.000Z'),
      storageFee: { amountMinor: 0, currency: 'AUD' },
      opened: true,
    });
    expect(saveRetrieval).toHaveBeenCalledTimes(1);
    expect(saveRetrieval.mock.calls[0][0].assignment.storageFeeMinor).toBe(0);
  });

  it('passes the fee from the policy straight through', async () => {
    const { service, saveRetrieval } = build({
      locker: theLocker(),
      pkg: activePackage(),
      fee: 1500,
    });

    const result = await service.retrieve({ lockerId: 'l-1', pickupCode: CODE });

    expect(result.storageFee.amountMinor).toBe(1500);
    expect(saveRetrieval.mock.calls[0][0].assignment.storageFeeMinor).toBe(1500);
  });

  it('fails the same way for an unknown locker, no active package, or a wrong code', async () => {
    const unknownLocker = build({ locker: null });
    await expect(
      unknownLocker.service.retrieve({ lockerId: 'l-1', pickupCode: CODE }),
    ).rejects.toThrow(PackageNotFoundForRetrievalError);

    const empty = build({ locker: theLocker(), pkg: null });
    await expect(
      empty.service.retrieve({ lockerId: 'l-1', pickupCode: CODE }),
    ).rejects.toThrow(PackageNotFoundForRetrievalError);

    const wrongCode = build({ locker: theLocker(), pkg: activePackage() });
    await expect(
      wrongCode.service.retrieve({ lockerId: 'l-1', pickupCode: '000000' }),
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
