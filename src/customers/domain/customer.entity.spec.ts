import { Customer } from './customer.entity.js';
import {
  CustomerContactRequiredError,
  CustomerNameRequiredError,
} from './errors.js';

const base = { id: 'c-1', name: 'Jordan', now: new Date('2026-01-01T00:00:00Z') };

describe('Customer.register', () => {
  it('requires at least one contact method', () => {
    expect(() => Customer.register({ ...base })).toThrow(
      CustomerContactRequiredError,
    );
    expect(() => Customer.register({ ...base, email: '   ', phone: '' })).toThrow(
      CustomerContactRequiredError,
    );
  });

  it('requires a name', () => {
    expect(() =>
      Customer.register({ ...base, name: '  ', email: 'a@b.com' }),
    ).toThrow(CustomerNameRequiredError);
  });

  it('accepts an email-only or phone-only customer', () => {
    expect(Customer.register({ ...base, email: 'a@b.com' }).phone).toBeNull();
    expect(Customer.register({ ...base, phone: '+61400000000' }).email).toBeNull();
  });

  it('trims name and contact fields', () => {
    const c = Customer.register({
      ...base,
      name: '  Jordan  ',
      email: '  a@b.com  ',
    });
    expect(c.name).toBe('Jordan');
    expect(c.email).toBe('a@b.com');
  });
});
