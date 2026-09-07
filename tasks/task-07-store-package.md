# Task 07 — Store package

**Level:** 1 · **Depends on:** 03, 04, 05, 06 · **Status:** Not started

## Goal

An agent stores a package for a customer: the system picks the smallest available locker that fits,
generates a pickup code, persists the package, and returns the locker identifier + pickup code.
If nothing fits, it returns a clear "cannot be stored" response.

## Scope

**In**

- `src/packages/domain/`:
  - `package.entity.ts` — `id`, `lockerId`, `customerId`, `size`, `pickupCodeHash`, `trackingRef?`,
    `storedByAgent?`, `storedAt`, `retrievedAt: null`, `storageFeeMinor: null`. Factory
    `Package.storeNew(...)` sets `storedAt` from the `Clock` (never from input).
  - `pickup-code.ts` — value object wrapping the plaintext code (validation: 6 digits); carried
    only in memory, never persisted.
  - `package.repository.ts` — port `PACKAGE_REPOSITORY`:
    - `save(pkg): Promise<void>` — maps `ER_DUP_ENTRY` on `active_locker_id` to
      `LockerJustTakenError`.
  - `errors.ts` — `NoSuitableLockerError extends ConflictDomainError` (message: "No suitable
    locker is available for this package size"), `LockerJustTakenError extends ConflictDomainError`.
- `src/packages/application/store-package.service.ts` —
  `storePackage({ size, customer, trackingRef?, agentId })`:
  1. `findOrCreate` the customer (Task 06).
  2. `LockerRepository.findAvailableSmallestFit(stationId, size)` → if `null`, throw
     `NoSuitableLockerError`.
  3. Generate pickup code + hash; build `Package.storeNew`; `PackageRepository.save`.
  4. Return `{ packageId, lockerId, lockerCode, pickupCode }` (plaintext code returned once here
     only).
  - On `LockerJustTakenError`: **Level 1** may surface it as `NoSuitableLockerError` /409 (retry
    loop is deferred to L4). Leave a `// TODO(L4): bounded retry` marker.
- `src/packages/interface/`:
  - `dto/store-package.dto.ts` — `size`, `customer: { name, email?, phone? }`, `trackingRef?`.
  - `packages.controller.ts` — `@Roles(AGENT)` · `POST /packages` → 201
    `{ packageId, lockerId, lockerCode, pickupCode }`; `NoSuitableLockerError` → 409.
- `src/packages/packages.module.ts` — imports LockersModule (for `LOCKER_REPOSITORY`),
  CustomersModule, SharedModule, AuthModule; binds `PACKAGE_REPOSITORY → MysqlPackageRepository`.

**Out**

- Retrieval endpoint → L2. Fees (`storageFeeMinor` stays null) → L3. `FOR UPDATE SKIP LOCKED`
  + bounded retry under concurrency → L4.

## Files

- create: everything under `src/packages/**` except retrieval
- create: `src/packages/application/store-package.service.spec.ts`
- change: `src/app.module.ts`

## Acceptance criteria

- [ ] Unit tests (fake repos): picks the smallest fitting locker (SMALL package + only MEDIUM free
  → uses MEDIUM; SMALL and MEDIUM free → uses SMALL); throws `NoSuitableLockerError` when none fit;
  `storedAt` comes from the injected clock, not from the request.
- [ ] Pickup code in the response is 6 digits; only its hash is passed to `save`.
- [ ] `POST /packages` as AGENT stores and returns the locker id + code; as CUSTOMER → 403.
- [ ] After a successful store, `GET /lockers` shows that locker `OCCUPIED`.
- [ ] Storing when every fitting locker is occupied → 409 with the "no suitable locker" message.
- [ ] DB-level: a duplicate active package for one locker is rejected by the unique constraint
  (covered by the repo mapping test / Task 08 concurrency check at L4).
