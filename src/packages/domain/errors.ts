import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../../shared/errors/domain-error.js';

export class PackageNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super('package_not_found', `No package with id ${id}`, { id });
  }
}

/** Store was called on a package that is already STORED or RETRIEVED. */
export class PackageAlreadyStoredError extends ConflictDomainError {
  constructor() {
    super('package_already_stored', 'This package has already been stored');
  }
}

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

export class InvalidPickupCodeError extends ValidationDomainError {
  constructor() {
    super('invalid_pickup_code', 'Pickup code must be exactly 6 digits');
  }
}

/**
 * One error for every "that doesn't match" case in retrieval — unknown locker,
 * no active package, wrong pickup code — so the response leaks nothing about
 * which part was wrong.
 */
export class PackageNotFoundForRetrievalError extends NotFoundDomainError {
  constructor() {
    super('retrieval_failed', 'No package matches that locker and pickup code');
  }
}

/** The package was retrieved by a concurrent request first. */
export class PackageAlreadyRetrievedError extends ConflictDomainError {
  constructor() {
    super('package_already_retrieved', 'This package has already been retrieved');
  }
}
