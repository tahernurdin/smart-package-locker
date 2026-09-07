export type DomainErrorKind =
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'forbidden';

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
