import {
  ConflictDomainError,
  ValidationDomainError,
} from '../../shared/errors/domain-error.js';

export class InvalidLockerCodeError extends ValidationDomainError {
  constructor() {
    super('invalid_locker_code', 'Locker code must not be empty');
  }
}

export class InvalidLockerSizeError extends ValidationDomainError {
  constructor(value: string) {
    super('invalid_locker_size', `Unknown locker size: ${value}`, { value });
  }
}

export class LockerCodeTakenError extends ConflictDomainError {
  constructor(stationId: string, code: string) {
    super(
      'locker_code_taken',
      `A locker with code "${code}" already exists at this station`,
      { stationId, code },
    );
  }
}
