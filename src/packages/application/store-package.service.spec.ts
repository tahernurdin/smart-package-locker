import { FindOrCreateCustomerService } from '../../customers/application/find-or-create-customer.service.js';
import { Customer } from '../../customers/domain/customer.entity.js';
import { DEFAULT_STATION_ID } from '../../lockers/application/create-locker.service.js';
import { Locker } from '../../lockers/domain/locker.entity.js';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import type { LockerRepository } from '../../lockers/domain/locker.repository.js';
import type { Clock } from '../../shared/clock/clock.js';
import type { IdGenerator } from '../../shared/id/id-generator.js';
import type { AppConfiguration } from '../../shared/config/configuration.js';
import type { PickupCodeGenerator } from '../../shared/pickup-code/pickup-code-generator.js';
import { PickupCodeHasher } from '../../shared/pickup-code/pickup-code-hasher.js';
import {
  LockerJustTakenError,
  NoSuitableLockerError,
  PickupCodeCollisionError,
} from '../domain/errors.js';
import type { Package } from '../domain/package.entity.js';
import type { PackageRepository } from '../domain/package.repository.js';
import { StorePackageService } from './store-package.service.js';

function locker(id: string, code: string, size: 'SMALL' | 'MEDIUM' | 'LARGE') {
  return Locker.create({
    id,
    stationId: DEFAULT_STATION_ID,
    code,
    size: LockerSize.of(size),
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

class FakeLockerRepo implements LockerRepository {
  constructor(private free: Locker[]) {}
  async save(): Promise<void> {}
  async findById(id: string): Promise<Locker | null> {
    return this.free.find((l) => l.id === id) ?? null;
  }
  async existsByStationAndCode(): Promise<boolean> {
    return false;
  }
  async listWithOccupancy() {
    return [];
  }
  async findAvailableSmallestFit(_stationId: string, required: LockerSize) {
    return (
      [...this.free]
        .filter((l) => l.size.fits(required))
        .sort(
          (a, b) => a.size.rank - b.size.rank || a.code.localeCompare(b.code),
        )[0] ?? null
    );
  }
}

class FakePackageRepo implements PackageRepository {
  readonly saved: Package[] = [];
  failuresQueue: Error[] = [];
  async save(pkg: Package): Promise<void> {
    const failure = this.failuresQueue.shift();
    if (failure) throw failure;
    this.saved.push(pkg);
  }
  async findActiveByLocker(lockerId: string): Promise<Package | null> {
    return this.saved.find((p) => p.lockerId === lockerId && p.isActive) ?? null;
  }
  async markRetrieved(): Promise<void> {}
}

const customers = {
  findOrCreate: async (d: { name: string; email?: string; phone?: string }) =>
    Customer.register({
      id: 'cust-1',
      name: d.name,
      email: d.email ?? null,
      phone: d.phone ?? null,
      now: new Date('2026-01-01T00:00:00Z'),
    }),
} as unknown as FindOrCreateCustomerService;

const hasher = new PickupCodeHasher({ pickupCodePepper: '' } as AppConfiguration);
const clock: Clock = { now: () => new Date('2026-06-01T00:00:00.000Z') };

function idGen(): IdGenerator {
  let n = 0;
  return { next: () => `pkg-${++n}` };
}

function fixedCode(code = '111111'): PickupCodeGenerator {
  return { generate: () => code };
}

const customerInput = { name: 'Jo', email: 'jo@example.com' };

describe('StorePackageService', () => {
  it('assigns the smallest locker that fits', async () => {
    const lockers = new FakeLockerRepo([
      locker('m', 'M-01', 'MEDIUM'),
      locker('s', 'S-01', 'SMALL'),
    ]);
    const pkgs = new FakePackageRepo();
    const service = new StorePackageService(
      lockers,
      pkgs,
      customers,
      fixedCode(),
      hasher,
      idGen(),
      clock,
    );

    const result = await service.storePackage({
      size: 'SMALL',
      customer: customerInput,
    });

    expect(result.lockerId).toBe('s');
    expect(result.lockerCode).toBe('S-01');
  });

  it('falls back to the next size up when smaller lockers are taken', async () => {
    const lockers = new FakeLockerRepo([locker('m', 'M-01', 'MEDIUM')]);
    const service = new StorePackageService(
      lockers,
      new FakePackageRepo(),
      customers,
      fixedCode(),
      hasher,
      idGen(),
      clock,
    );

    const result = await service.storePackage({
      size: 'SMALL',
      customer: customerInput,
    });

    expect(result.lockerId).toBe('m');
  });

  it('throws NoSuitableLockerError when nothing fits', async () => {
    const lockers = new FakeLockerRepo([locker('s', 'S-01', 'SMALL')]);
    const service = new StorePackageService(
      lockers,
      new FakePackageRepo(),
      customers,
      fixedCode(),
      hasher,
      idGen(),
      clock,
    );

    await expect(
      service.storePackage({ size: 'LARGE', customer: customerInput }),
    ).rejects.toThrow(NoSuitableLockerError);
  });

  it('stores only the hash and returns a 6-digit code and the storedAt from the clock', async () => {
    const pkgs = new FakePackageRepo();
    const service = new StorePackageService(
      new FakeLockerRepo([locker('s', 'S-01', 'SMALL')]),
      pkgs,
      customers,
      fixedCode('482913'),
      hasher,
      idGen(),
      clock,
    );

    const result = await service.storePackage({
      size: 'SMALL',
      customer: customerInput,
    });

    expect(result.pickupCode).toBe('482913');
    expect(pkgs.saved[0].pickupCodeHash).toBe(hasher.hash('482913'));
    expect(pkgs.saved[0].pickupCodeHash).not.toContain('482913');
    expect(pkgs.saved[0].storedAt.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('regenerates the pickup code on collision, then succeeds', async () => {
    const pkgs = new FakePackageRepo();
    pkgs.failuresQueue = [new PickupCodeCollisionError()];
    const service = new StorePackageService(
      new FakeLockerRepo([locker('s', 'S-01', 'SMALL')]),
      pkgs,
      customers,
      fixedCode(),
      hasher,
      idGen(),
      clock,
    );

    const result = await service.storePackage({
      size: 'SMALL',
      customer: customerInput,
    });

    expect(result.packageId).toBe('pkg-2');
    expect(pkgs.saved).toHaveLength(1);
  });

  it('surfaces a lost allocation race as NoSuitableLockerError (L1)', async () => {
    const pkgs = new FakePackageRepo();
    pkgs.failuresQueue = [new LockerJustTakenError()];
    const service = new StorePackageService(
      new FakeLockerRepo([locker('s', 'S-01', 'SMALL')]),
      pkgs,
      customers,
      fixedCode(),
      hasher,
      idGen(),
      clock,
    );

    await expect(
      service.storePackage({ size: 'SMALL', customer: customerInput }),
    ).rejects.toThrow(NoSuitableLockerError);
  });
});
