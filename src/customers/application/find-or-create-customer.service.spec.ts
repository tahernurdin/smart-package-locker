import type { Clock } from '../../shared/clock/clock.js';
import type { IdGenerator } from '../../shared/id/id-generator.js';
import { Customer } from '../domain/customer.entity.js';
import type {
  CustomerContact,
  CustomerRepository,
} from '../domain/customer.repository.js';
import { FindOrCreateCustomerService } from './find-or-create-customer.service.js';

class FakeCustomerRepository implements CustomerRepository {
  readonly saved: Customer[] = [];

  async findByContact(contact: CustomerContact): Promise<Customer | null> {
    return (
      this.saved.find(
        (c) =>
          (!!contact.email && c.email === contact.email) ||
          (!!contact.phone && c.phone === contact.phone),
      ) ?? null
    );
  }

  async save(customer: Customer): Promise<void> {
    this.saved.push(customer);
  }
}

const clock: Clock = { now: () => new Date('2026-06-01T00:00:00Z') };

function idGen(): IdGenerator {
  let n = 0;
  return { next: () => `c-${++n}` };
}

describe('FindOrCreateCustomerService', () => {
  it('returns the existing customer when the email matches', async () => {
    const repo = new FakeCustomerRepository();
    const service = new FindOrCreateCustomerService(repo, idGen(), clock);

    const first = await service.findOrCreate({ name: 'Jo', email: 'jo@x.com' });
    const again = await service.findOrCreate({
      name: 'Someone Else',
      email: 'jo@x.com',
    });

    expect(again.id).toBe(first.id);
    expect(repo.saved).toHaveLength(1);
  });

  it('creates exactly one customer per new contact', async () => {
    const repo = new FakeCustomerRepository();
    const service = new FindOrCreateCustomerService(repo, idGen(), clock);

    await service.findOrCreate({ name: 'A', phone: '111' });
    await service.findOrCreate({ name: 'B', phone: '222' });

    expect(repo.saved.map((c) => c.id)).toEqual(['c-1', 'c-2']);
  });
});
