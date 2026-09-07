# Task 10 — RetrievePackageService (+ fee-policy seam)

**Level:** 2 · **Depends on:** 09 · **Status:** Done

## Goal

The use case: given a locker id and a pickup code, verify them, mark the package retrieved, free the
locker, and return a pickup confirmation. The storage fee is produced by a policy that is trivial
now and becomes the tiered calculation in Level 3 — the service does not change between levels.

## Scope

**In**

- `src/packages/domain/storage-fee.policy.ts`:
  ```ts
  export const STORAGE_FEE_POLICY = Symbol('STORAGE_FEE_POLICY');
  export interface StorageFeeInput { size: LockerSize; storedAt: Date; retrievedAt: Date; }
  export interface StorageFeePolicy { calculate(input: StorageFeeInput): Promise<number>; } // minor units
  ```
- `src/packages/infrastructure/flat-zero-storage-fee.policy.ts` — `FlatZeroStorageFeePolicy`
  returning `0`. (Level 3 replaces the binding with `TieredStorageFeePolicy`.)
- `src/packages/application/retrieve-package.service.ts` —
  `retrieve(input: { lockerId: string; pickupCode: string }): Promise<RetrievedPackage>`:
  1. `PickupCode.of(input.pickupCode)` (defence; the DTO already checks the shape).
  2. `lockers.findById(lockerId)` → null → `PackageNotFoundForRetrievalError`.
  3. `packages.findActiveByLocker(lockerId)` → null → `PackageNotFoundForRetrievalError`.
  4. `hasher.verify(pickupCode, pkg.pickupCodeHash)` → false → `PackageNotFoundForRetrievalError`.
  5. `fee = await feePolicy.calculate({ size: pkg.size, storedAt: pkg.storedAt, retrievedAt: clock.now() })`.
  6. `retrieved = pkg.retrieve({ now: clock.now(), storageFeeMinor: fee })`.
  7. `packages.markRetrieved(retrieved)`.
  8. return `{ packageId, lockerId, lockerCode, retrievedAt, storageFee: { amountMinor: fee, currency }, opened: true }`
     — `currency` from `APP_CONFIG`. `opened: true` stands in for the physical latch.
- Call `clock.now()` once and reuse it for steps 5–6.

**Out**

- HTTP wiring / DTO → Task 11.
- Real fee bands → Level 3.

## Files

- create: `src/packages/domain/storage-fee.policy.ts`,
  `src/packages/infrastructure/flat-zero-storage-fee.policy.ts`,
  `src/packages/application/retrieve-package.service.ts`,
  `src/packages/application/retrieve-package.service.spec.ts`

## Acceptance criteria

- [ ] Unit tests (fakes): happy path returns the confirmation and calls `markRetrieved` once with
  `storageFeeMinor` from the policy; unknown locker, no active package, and wrong code each throw
  `PackageNotFoundForRetrievalError` (same code/message).
- [ ] `retrievedAt` in the result comes from the injected clock.
- [ ] The service depends only on ports (`LockerRepository`, `PackageRepository`,
  `StorageFeePolicy`, `PickupCodeHasher`, `Clock`, `APP_CONFIG`) — no MySQL, no HTTP.
- [ ] Swapping the `StorageFeePolicy` fake changes the returned `amountMinor` with no other change.
