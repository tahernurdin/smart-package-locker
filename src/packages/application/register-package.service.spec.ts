import { InvalidLockerSizeError } from '../../lockers/domain/errors.js';
import type { Clock } from '../../shared/clock/clock.js';
import type { IdGenerator } from '../../shared/id/id-generator.js';
import { Package } from '../domain/package.entity.js';
import type { PackageRepository } from '../domain/package.repository.js';
import { RegisterPackageService } from './register-package.service.js';

class FakePackageRepo implements PackageRepository {
  readonly saved: Package[] = [];
  async save(pkg: Package) {
    this.saved.push(pkg);
  }
  async findById() {
    return null;
  }
  async findActiveByLocker() {
    return null;
  }
  async reserveLockerAndStore() {
    return null;
  }
  async savePickupCode() {}
  async saveRetrieval() {}
}

const clock: Clock = { now: () => new Date('2026-06-01T00:00:00.000Z') };

function idGen(): IdGenerator {
  let n = 0;
  return { next: () => `pkg-${++n}` };
}

function build() {
  const packages = new FakePackageRepo();
  return {
    packages,
    service: new RegisterPackageService(packages, idGen(), clock),
  };
}

describe('RegisterPackageService', () => {
  it('registers a package against the given customer id', async () => {
    const { service, packages } = build();

    const result = await service.register({
      size: 'MEDIUM',
      customerId: 'cust-1',
      trackingRef: 'TRK-9',
    });

    expect(result).toEqual({ packageId: 'pkg-1', status: 'REGISTERED' });
    expect(packages.saved).toHaveLength(1);
    expect(packages.saved[0].status).toBe('REGISTERED');
    expect(packages.saved[0].customerId).toBe('cust-1');
    expect(packages.saved[0].createdAt).toEqual(clock.now());
  });

  it('does not resolve the customer id (owned by an upstream service)', async () => {
    const { service, packages } = build();

    await service.register({ size: 'SMALL', customerId: 'any-external-id' });

    expect(packages.saved).toHaveLength(1);
    expect(packages.saved[0].customerId).toBe('any-external-id');
  });

  it('rejects an unknown size before touching the repository', async () => {
    const { service, packages } = build();
    await expect(
      service.register({ size: 'HUGE', customerId: 'cust-1' }),
    ).rejects.toThrow(InvalidLockerSizeError);
    expect(packages.saved).toHaveLength(0);
  });
});
