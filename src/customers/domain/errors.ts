import {
  NotFoundDomainError,
  ValidationDomainError,
} from '../../shared/errors/domain-error.js';

export class CustomerContactRequiredError extends ValidationDomainError {
  constructor() {
    super(
      'customer_contact_required',
      'A customer needs at least an email or a phone number',
    );
  }
}

export class CustomerNameRequiredError extends ValidationDomainError {
  constructor() {
    super('customer_name_required', 'A customer needs a name');
  }
}

export class CustomerNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super('customer_not_found', `No customer with id ${id}`, { id });
  }
}
