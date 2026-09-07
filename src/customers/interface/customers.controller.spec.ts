import type { Clock } from '../../shared/clock/clock.js';
import type { IdGenerator } from '../../shared/id/id-generator.js';
import { FindOrCreateCustomerService } from '../application/find-or-create-customer.service.js';
import { Customer } from '../domain/customer.entity.js';
import {
  CustomerContactRequiredError,
} from '../domain/errors.js';
import type {
  CustomerContact,
  CustomerRepository,
} from '../domain/customer.repository.js';
import { CustomersController } from './customers.controller.js';

class FakeCustomerRepository implements CustomerRepository {
  readonly saved: Customer[] = [];
  async findById(id: string) {
    return this.saved.find((c) => c.id === id) ?? null;
  }
  async findByContact(contact: CustomerContact) {
    return (
      this.saved.find(
        (c) =>
          (!!contact.email && c.email === contact.email) ||
          (!!contact.phone && c.phone === contact.phone),
      ) ?? null
    );
  }
  async save(customer: Customer) {
    this.saved.push(customer);
  }
}

const clock: Clock = { now: () => new Date('2026-06-01T00:00:00Z') };

function controller() {
  const repo = new FakeCustomerRepository();
  let n = 0;
  const ids: IdGenerator = { next: () => `cust-${++n}` };
  return new CustomersController(
    new FindOrCreateCustomerService(repo, ids, clock),
  );
}

describe('CustomersController', () => {
  it('creates a customer and returns its id', async () => {
    const res = await controller().create({ name: 'Jo', email: 'jo@x.com' });
    expect(res).toEqual({
      customerId: 'cust-1',
      name: 'Jo',
      email: 'jo@x.com',
      phone: null,
    });
  });

  it('is idempotent on an email match', async () => {
    const ctrl = controller();
    const first = await ctrl.create({ name: 'Jo', email: 'jo@x.com' });
    const again = await ctrl.create({ name: 'Jo Again', email: 'jo@x.com' });
    expect(again.customerId).toBe(first.customerId);
  });

  it('rejects a customer with no contact method', async () => {
    await expect(controller().create({ name: 'Jo' })).rejects.toThrow(
      CustomerContactRequiredError,
    );
  });
});
