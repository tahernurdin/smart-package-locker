import {
  ConflictDomainError,
  ValidationDomainError,
} from '../../shared/errors/domain-error.js';

/**
 * A rate table that is already persisted and turns out to be unusable — a
 * missing size, a gap between bands. That is an operational bug on the read
 * path, not a client mistake, so it stays a plain `Error` and the filter maps it
 * to 500 without leaking details.
 *
 * Operator input never reaches this: the publish path validates through
 * `StorageRateSchedule` and raises the `ValidationDomainError`s below instead.
 */
export class StorageRateConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageRateConfigError';
  }
}

export class InvalidStorageRateBandError extends ValidationDomainError {
  constructor(message: string) {
    super('invalid_storage_rate_band', message);
  }
}

/**
 * The bands of one version have to tile `[0, ∞)` — start at day 0, meet exactly
 * at their edges, and end open-ended — or the fee calculator would hit a day no
 * band covers and throw mid-retrieval. MySQL cannot express that as a
 * constraint (it needs range exclusion), so this is the only thing enforcing it.
 */
export class InvalidStorageRateScheduleError extends ValidationDomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('invalid_storage_rate_schedule', message, details);
  }
}

/**
 * Rates are forward-only. Backdating a version would reprice packages already
 * sitting in lockers, which is the exact thing `effective_from` exists to
 * prevent — correct a mistake by publishing a new version, not by rewriting the
 * past.
 */
export class StorageRateBackdatedError extends ValidationDomainError {
  constructor(effectiveFrom: Date, now: Date) {
    super(
      'storage_rate_backdated',
      `effectiveFrom must be in the future (got ${effectiveFrom.toISOString()}, now ${now.toISOString()})`,
      { effectiveFrom: effectiveFrom.toISOString(), now: now.toISOString() },
    );
  }
}

export class StorageRateVersionExistsError extends ConflictDomainError {
  constructor(sizeCode: string, effectiveFrom: Date) {
    super(
      'storage_rate_version_exists',
      `A ${sizeCode} rate version already takes effect at ${effectiveFrom.toISOString()}`,
      { sizeCode, effectiveFrom: effectiveFrom.toISOString() },
    );
  }
}
