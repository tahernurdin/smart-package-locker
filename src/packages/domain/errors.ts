import {
  ConflictDomainError,
  ValidationDomainError,
} from '../../shared/errors/domain-error.js';

export class NoSuitableLockerError extends ConflictDomainError {
  constructor(size: string) {
    super(
      'no_suitable_locker',
      'No suitable locker is available for this package size',
      { size },
    );
  }
}

/** A concurrent request claimed the locker between allocation and insert. */
export class LockerJustTakenError extends ConflictDomainError {
  constructor() {
    super(
      'locker_just_taken',
      'The selected locker was just taken by another request',
    );
  }
}

/** The generated pickup code clashed with another active package's — regenerate. */
export class PickupCodeCollisionError extends ConflictDomainError {
  constructor() {
    super('pickup_code_collision', 'Pickup code collision, please retry');
  }
}

export class InvalidPickupCodeError extends ValidationDomainError {
  constructor() {
    super('invalid_pickup_code', 'Pickup code must be exactly 6 digits');
  }
}
