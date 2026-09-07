import {
  ConflictDomainError,
  NotFoundDomainError,
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

export class LockerNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super('locker_not_found', `No locker with id ${id}`, { id });
  }
}

/** Decommissioning is terminal: a retired locker can't be edited or retired again. */
export class LockerDecommissionedError extends ConflictDomainError {
  constructor(id: string) {
    super('locker_decommissioned', `Locker ${id} is decommissioned`, { id });
  }
}

/**
 * A locker holding a package can't be retired — the parcel inside still has to
 * come out, and the pickup code the customer holds names this locker.
 */
export class LockerOccupiedError extends ConflictDomainError {
  constructor(id: string) {
    super(
      'locker_occupied',
      `Locker ${id} still holds a package; it must be retrieved first`,
      { id },
    );
  }
}
