import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id/id-generator.js';
import { Customer } from '../domain/customer.entity.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../domain/customer.repository.js';

export interface CustomerDetails {
  name: string;
  email?: string | null;
  phone?: string | null;
}

@Injectable()
export class FindOrCreateCustomerService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async findOrCreate(details: CustomerDetails): Promise<Customer> {
    const existing = await this.customers.findByContact({
      email: details.email,
      phone: details.phone,
    });
    if (existing) return existing;

    const customer = Customer.register({
      id: this.ids.next(),
      name: details.name,
      email: details.email ?? null,
      phone: details.phone ?? null,
      now: this.clock.now(),
    });
    await this.customers.save(customer);
    return customer;
  }
}
