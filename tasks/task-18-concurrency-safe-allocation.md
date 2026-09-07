# Task 18 — Concurrency-safe allocation: transactional reserve-and-store

**Level:** 4 (optional) · **Depends on:** 17 · **Status:** Not started

## Why

Correctness is *already* guaranteed — `uq_one_active_package_per_locker` (unique over the
`active_locker_id` generated column) means two concurrent inserts for the same locker can't both
win, and `test/level1.e2e-spec.ts` proves it. What's missing is **efficiency and fairness under
contention**: today every concurrent agent `SELECT`s the *same* smallest free locker, all but one
`INSERT` fails with `ER_DUP_ENTRY`, and — because Task 07 left a `TODO(L4)` — the losers get
`no_suitable_locker` even when other lockers are free.

Fix: select the candidate **and** insert the package in one transaction, locking the candidate row
with `FOR UPDATE ... SKIP LOCKED` so concurrent agents fan out to different lockers; retry the
handful of genuine races.

## Design

The lock only lives inside a transaction, so the SELECT and the INSERT must share one. Rather than
leak a `PoolConnection` through the domain ports, fold both steps into a single repository method:

```ts
// packages/domain/package.repository.ts
export interface StoredPackageRow {
  packageId: string;
  lockerId: string;
  lockerCode: string;
}

export interface PackageRepository {
  // save(pkg) is REMOVED — replaced by:
  /**
   * One transaction: pick the smallest free serviceable locker at `stationId`
   * that fits `size`, locking it with FOR UPDATE ... SKIP LOCKED so concurrent
   * callers get a different one; build the package for that locker via `build`;
   * insert it; commit. null when nothing fits. A lost race still surfaces as
   * LockerJustTakenError (the unique index is the final backstop) for the
   * caller to retry.
   */
  storeInSmallestFit(params: {
    stationId: string;
    size: LockerSize;
    build: (lockerId: string) => Package;
  }): Promise<StoredPackageRow | null>;

  findActiveByLocker(lockerId: string): Promise<Package | null>;
  markRetrieved(pkg: Package): Promise<void>;
}
```

`MysqlPackageRepository.storeInSmallestFit` (via the existing `withTransaction` helper):

```sql
SELECT l.id, l.code
FROM locker l
LEFT JOIN package p ON p.active_locker_id = l.id
WHERE l.station_id = :stationId
  AND l.status = 'IN_SERVICE'
  AND p.id IS NULL
  AND FIELD(l.size_code, 'SMALL','MEDIUM','LARGE') >= FIELD(:sizeCode, 'SMALL','MEDIUM','LARGE')
ORDER BY FIELD(l.size_code, 'SMALL','MEDIUM','LARGE'), l.code
LIMIT 1
FOR UPDATE OF l SKIP LOCKED
```

- `FOR UPDATE OF l` locks only the `locker` row; `SKIP LOCKED` skips rows another tx already holds.
- `null` rows → return `null`.
- else `const pkg = build(locker.id)`; `INSERT INTO package (...)`; map `ER_DUP_ENTRY` to
  `PickupCodeCollisionError` / `LockerJustTakenError` (moved from the old `save`); commit; return
  `{ packageId: pkg.id, lockerId: locker.id, lockerCode: locker.code }`.

## Scope

**In**

- `src/shared/database/size-order.ts` — export `sizeOrderExpr(column: string): string` returning
  `FIELD(<column>, 'SMALL', 'MEDIUM', 'LARGE')`. Used by both mysql repositories (replaces the
  local `sizeRank` in `mysql-locker.repository.ts`).
- `packages/domain/package.repository.ts` — swap `save` → `storeInSmallestFit`; add
  `StoredPackageRow`.
- `packages/infrastructure/mysql-package.repository.ts` — implement `storeInSmallestFit`
  transactionally; delete `save`.
- `lockers/domain/locker.repository.ts` + `mysql-locker.repository.ts` — **remove**
  `findAvailableSmallestFit` (now dead; `storeInSmallestFit` owns allocation).
- `packages/application/store-package.service.ts`:
  - customer find-or-create first (fail fast on unknown size still applies).
  - a bounded loop (`MAX_ATTEMPTS = 3`): generate a pickup code, call `storeInSmallestFit` with a
    `build` closure; on `PickupCodeCollisionError` or `LockerJustTakenError` retry; on `null` throw
    `NoSuitableLockerError`; return `{ ...row, pickupCode }`.
  - drop the old `TODO(L4)` and the `NoSuitableLockerError`-on-`LockerJustTakenError` shortcut.
- Update fakes: `store-package.service.spec.ts` (fake `storeInSmallestFit`),
  `create-locker.service.spec.ts` / `list-lockers.service.spec.ts` (drop
  `findAvailableSmallestFit`), `retrieve-package.service.spec.ts` (unaffected — uses
  `findActiveByLocker`).

**Out**

- Retrieval concurrency — already handled in L2 (`markRetrieved` conditional `UPDATE`, tested with
  6 concurrent retrieves).
- Any change to the schema (the unique index is already there).
- Contention e2e → Task 19.

## Files

- create: `src/shared/database/size-order.ts`
- change: `src/packages/domain/package.repository.ts`,
  `src/packages/infrastructure/mysql-package.repository.ts`,
  `src/lockers/domain/locker.repository.ts`,
  `src/lockers/infrastructure/mysql-locker.repository.ts`,
  `src/packages/application/store-package.service.ts`, and the affected `*.spec.ts` fakes

## Acceptance criteria

- [ ] Unit: `StorePackageService` retries once when `storeInSmallestFit` throws
  `LockerJustTakenError` then succeeds; throws `NoSuitableLockerError` after `MAX_ATTEMPTS` losses
  or an immediate `null`; retries on `PickupCodeCollisionError`.
- [ ] Manual DB check: two `storeInSmallestFit` calls interleaved on separate connections against a
  station with 2 free lockers get **different** lockers, no error.
- [ ] `npm run lint` / `npm run build` / `npm run test` green; `findAvailableSmallestFit` gone.
- [ ] `npm run test:e2e` green — Level 1 concurrency test still passes.
