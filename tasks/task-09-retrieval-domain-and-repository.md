# Task 09 — Package retrieval: domain transition + repository reads

**Level:** 2 · **Depends on:** 07 · **Status:** Not started

## Goal

Give the `Package` aggregate a retrieval transition, and the repositories the reads/writes a
retrieval needs: look up the active package in a locker, look up a locker by id, and mark a package
retrieved without losing a concurrent race.

## Scope

**In**

- `src/packages/domain/package.entity.ts`:
  - `retrieve(params: { now: Date; storageFeeMinor: number }): Package` — returns a **new**
    `Package` (entities stay immutable) with `retrievedAt` and `storageFeeMinor` set.
  - Guard: throw `PackageAlreadyRetrievedError` when `!isActive`.
  - `retrievedAt = params.now < storedAt ? storedAt : params.now` (never violates the
    `retrieved_at >= stored_at` DB CHECK if a frozen test clock is behind).
- `src/packages/domain/errors.ts`:
  - `PackageNotFoundForRetrievalError extends NotFoundDomainError` — code `retrieval_failed`,
    message `No package matches that locker and pickup code`. **One error** for unknown locker,
    no active package, and wrong pickup code, so retrieval leaks nothing about which part was
    wrong.
  - `PackageAlreadyRetrievedError extends ConflictDomainError` — only for the concurrent
    double-retrieve race (see `markRetrieved`).
- `src/packages/domain/package.repository.ts` — extend `PackageRepository`:
  - `findActiveByLocker(lockerId: string): Promise<Package | null>`
  - `markRetrieved(pkg: Package): Promise<void>` — conditional
    `UPDATE package SET retrieved_at = :retrievedAt, storage_fee_minor = :fee
     WHERE id = :id AND retrieved_at IS NULL`; if `affectedRows === 0` throw
    `PackageAlreadyRetrievedError`.
- `src/packages/infrastructure/mysql-package.repository.ts` — implement both; add a `toPackage(row)`
  mapper (mirrors `MysqlLockerRepository.toLocker`).
- `src/lockers/domain/locker.repository.ts` + `mysql-locker.repository.ts` — add
  `findById(id: string): Promise<Locker | null>` (retrieval needs to confirm the locker exists and
  read its `code`).

**Out**

- The retrieval use case / HTTP → Tasks 10–11.
- Fee calculation → the fee is passed in; the tiered policy is Level 3.

## Files

- change: `src/packages/domain/{package.entity.ts,errors.ts,package.repository.ts}`
- change: `src/packages/infrastructure/mysql-package.repository.ts`
- change: `src/lockers/domain/locker.repository.ts`,
  `src/lockers/infrastructure/mysql-locker.repository.ts`
- change/add: `src/packages/domain/package.entity.spec.ts`

## Acceptance criteria

- [ ] `Package.retrieve` returns a retrieved copy; the original is unchanged; a second
  `retrieve()` throws `PackageAlreadyRetrievedError`.
- [ ] `retrieve()` with a `now` before `storedAt` clamps `retrievedAt` to `storedAt`.
- [ ] Unit test (against MySQL or a fake): `markRetrieved` on an already-retrieved row throws
  `PackageAlreadyRetrievedError` (0 rows affected).
- [ ] `npm run lint` / `npm run build` / `npm run test` green.
