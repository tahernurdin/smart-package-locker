import { Customer } from '../../customers/domain/customer.entity.js';
import type {
  CustomerContact,
  CustomerRepository,
} from '../../customers/domain/customer.repository.js';
import { CustomerNotFoundError } from '../../customers/domain/errors.js';
import { InvalidLockerSizeError } from '../../lockers/domain/errors.js';
import type { Clock } from '../../shared/clock/clock.js';
import type { IdGenerator } from '../../shared/id/id-generator.js';
import { Package } from '../domain/package.entity.js';
import type { PackageRepository } from '../domain/package.repository.js';
import { RegisterPackageService } from './register-package.service.js';

class FakeCustomerRepo implements CustomerRepository {
  readonly customers = new Map<string, Customer>();
  async findById(id: string) {
    return this.customers.get(id) ?? null;
  }
  async findByContact(_c: CustomerContact) {
    return null;
  }
  async save(customer: Customer) {
    this.customers.set(customer.id, customer);
  }
}

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
  async saveRetrieval() {}
}

const clock: Clock = { now: () => new Date('2026-06-01T00:00:00.000Z') };

function idGen(): IdGenerator {
  let n = 0;
  return { next: () => `pkg-${++n}` };
}

function build() {
  const customers = new FakeCustomerRepo();
  customers.customers.set(
    'cust-1',
    Customer.register({
      id: 'cust-1',
      name: 'Jo',
      email: 'jo@example.com',
      now: clock.now(),
    }),
  );
  const packages = new FakePackageRepo();
  return {
    customers,
    packages,
    service: new RegisterPackageService(packages, customers, idGen(), clock),
  };
}

describe('RegisterPackageService', () => {
  it('registers a package against an existing customer', async () => {
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

  it('throws CustomerNotFoundError for an unknown customer', async () => {
    const { service, packages } = build();
    await expect(
      service.register({ size: 'SMALL', customerId: 'ghost' }),
    ).rejects.toThrow(CustomerNotFoundError);
    expect(packages.saved).toHaveLength(0);
  });

  it('rejects an unknown size before touching the repositories', async () => {
    const { service, packages } = build();
    await expect(
      service.register({ size: 'HUGE', customerId: 'cust-1' }),
    ).rejects.toThrow(InvalidLockerSizeError);
    expect(packages.saved).toHaveLength(0);
  });
});
