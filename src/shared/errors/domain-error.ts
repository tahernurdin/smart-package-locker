export type DomainErrorKind =
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'forbidden'
  | 'rate_limited';

/**
 * Base class for expected, business-meaningful failures. Thrown from domain and
 * application code; the global exception filter maps `kind` to an HTTP status.
 * Never throw `HttpException` from a service — throw one of these.
 */
export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export abstract class NotFoundDomainError extends DomainError {
  readonly kind = 'not_found';
}

export abstract class ConflictDomainError extends DomainError {
  readonly kind = 'conflict';
}

export abstract class ValidationDomainError extends DomainError {
  readonly kind = 'validation';
}

export abstract class ForbiddenDomainError extends DomainError {
  readonly kind = 'forbidden';
}

/**
 * Too many attempts, come back later. `retryAfterSeconds` is required rather
 * than optional: the filter turns it into the `Retry-After` header, and a 429
 * that does not say when to return is one clients can only answer by retrying
 * blindly.
 */
export abstract class RateLimitedDomainError extends DomainError {
  readonly kind = 'rate_limited';

  constructor(
    code: string,
    message: string,
    readonly retryAfterSeconds: number,
    details?: Record<string, unknown>,
  ) {
    super(code, message, { ...details, retryAfterSeconds });
  }
}
