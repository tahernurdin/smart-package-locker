# Task 03 — Shared kernel

**Level:** 1 · **Depends on:** 01 · **Status:** Not started

## Goal

The cross-cutting primitives every feature depends on: deterministic time and identifiers, pickup
code generation/hashing, a domain-error base, and the filter that maps those errors to HTTP.

## Scope

**In**

- `src/shared/clock/` — `Clock` interface (`now(): Date`), `SystemClock` implementation, token
  `CLOCK`.
- `src/shared/id/` — `IdGenerator` interface (`next(): string`), `UuidGenerator`
  (`crypto.randomUUID()`), token `ID_GENERATOR`.
- `src/shared/pickup-code/`:
  - `PickupCodeGenerator` interface (`generate(): string`), `NumericPickupCodeGenerator` — 6
    digits, cryptographically random, leading zeros allowed; token `PICKUP_CODE_GENERATOR`.
  - `PickupCodeHasher` — `hash(code): string` (SHA-256 hex, optional pepper from config) and
    `verify(code, hash): boolean` using `crypto.timingSafeEqual`.
- `src/shared/errors/`:
  - `DomainError` abstract base (`code: string`, `message`, optional `details`).
  - `domain-exception.filter.ts` — global `ExceptionFilter` mapping `DomainError` subclasses to
    HTTP status via a registry (`NotFound → 404`, `Conflict → 409`, `Validation → 422`,
    `Forbidden → 403`); unknown errors → 500 with no leakage.
  - Marker subclasses to extend: `NotFoundDomainError`, `ConflictDomainError`,
    `ValidationDomainError`.
- Register the filter globally (`APP_FILTER`) and each provider in a `SharedModule` (global).

**Out**

- Feature-specific error classes (live in each feature's `domain/errors.ts`).
- Auth guards → Task 04.

## Files

- create: `src/shared/clock/{clock.ts,system-clock.ts}`
- create: `src/shared/id/{id-generator.ts,uuid-generator.ts}`
- create: `src/shared/pickup-code/{pickup-code-generator.ts,numeric-pickup-code-generator.ts,pickup-code-hasher.ts}`
- create: `src/shared/errors/{domain-error.ts,domain-exception.filter.ts}`
- create: `src/shared/shared.module.ts`
- change: `src/app.module.ts`

## Acceptance criteria

- [ ] Unit tests: `NumericPickupCodeGenerator` returns 6-char digit strings; `PickupCodeHasher`
  round-trips and rejects a wrong code; `SystemClock.now()` returns a `Date`.
- [ ] Unit test: `domain-exception.filter` maps a `ConflictDomainError` to `409` with
  `{ code, message }` and a non-`DomainError` to `500` without exposing the message.
- [ ] Providers resolve by token in a test module.
