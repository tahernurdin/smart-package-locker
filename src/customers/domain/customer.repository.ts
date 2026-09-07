import type { Customer } from './customer.entity.js';

export const CUSTOMER_REPOSITORY = Symbol('CUSTOMER_REPOSITORY');

export interface CustomerContact {
  email?: string | null;
  phone?: string | null;
}

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  /** Match on email first, then phone. Null when neither is supplied or found. */
  findByContact(contact: CustomerContact): Promise<Customer | null>;
  save(customer: Customer): Promise<void>;
}
