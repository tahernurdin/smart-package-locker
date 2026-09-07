import {
  CustomerContactRequiredError,
  CustomerNameRequiredError,
} from './errors.js';

export interface CustomerProps {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
}

function trimToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export class Customer {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly createdAt: Date;

  private constructor(props: CustomerProps) {
    this.id = props.id;
    this.name = props.name;
    this.email = props.email;
    this.phone = props.phone;
    this.createdAt = props.createdAt;
  }

  static register(params: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    now: Date;
  }): Customer {
    const name = params.name.trim();
    const email = trimToNull(params.email);
    const phone = trimToNull(params.phone);
    if (!name) throw new CustomerNameRequiredError();
    if (!email && !phone) throw new CustomerContactRequiredError();
    return new Customer({ id: params.id, name, email, phone, createdAt: params.now });
  }

  static fromPersistence(props: CustomerProps): Customer {
    return new Customer(props);
  }
}
