import {
  ConflictDomainError,
  NotFoundDomainError,
  RateLimitedDomainError,
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

/** An unknown `sortBy`/`sortDir` on a package listing. */
export class InvalidPackageSortError extends ValidationDomainError {
  constructor(field: string, value: string, allowed: readonly string[]) {
    super(
      'invalid_package_sort',
      `Unknown ${field}: ${value}. Expected one of ${allowed.join(', ')}`,
      { field, value, allowed: [...allowed] },
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
 * no active package, someone else's parcel, wrong pickup code — so the response
 * leaks nothing about which part was wrong.
 */
export class PackageNotFoundForRetrievalError extends NotFoundDomainError {
  constructor() {
    super('retrieval_failed', 'No package matches that locker and pickup code');
  }
}

/**
 * Too many failed pickups at one locker by one customer. Raised before the
 * request is looked at, so it says nothing about the locker either — only that
 * this caller has been asking too often.
 */
export class TooManyRetrievalAttemptsError extends RateLimitedDomainError {
  constructor(retryAfterSeconds: number) {
    super(
      'too_many_retrieval_attempts',
      'Too many failed attempts for this locker. Try again later',
      retryAfterSeconds,
    );
  }
}

/** The package was retrieved by a concurrent request first. */
export class PackageAlreadyRetrievedError extends ConflictDomainError {
  constructor() {
    super(
      'package_already_retrieved',
      'This package has already been retrieved',
    );
  }
}

/**
 * A pickup code was asked for on a parcel that is not the caller's, does not
 * exist, or was never stored. One answer for all three: a customer may only
 * learn about their own parcels, and guessing at package ids must not confirm
 * which ones are real.
 */
export class PickupCodeNotReissuableError extends NotFoundDomainError {
  constructor() {
    super(
      'pickup_code_reissue_failed',
      'No stored parcel of yours matches that id',
    );
  }
}

/** The parcel is the caller's, but it is not sitting in a locker right now. */
export class PackageNotStoredError extends ConflictDomainError {
  constructor(status: string) {
    super(
      'package_not_stored',
      `This parcel is ${status}; only a stored parcel has a pickup code`,
      { status },
    );
  }
}

/**
 * This parcel has been given as many codes as its window allows. Each re-issue
 * notifies the customer, so the cap is on cost rather than on guessing: the
 * count is never cleared, and the only way back is to wait it out.
 */
export class TooManyPickupCodeReissuesError extends RateLimitedDomainError {
  constructor(retryAfterSeconds: number) {
    super(
      'too_many_pickup_code_reissues',
      'This parcel has been given too many pickup codes. Try again later',
      retryAfterSeconds,
    );
  }
}
