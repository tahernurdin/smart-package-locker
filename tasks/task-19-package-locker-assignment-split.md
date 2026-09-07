# Task 19 — Split `package` into `package` + `locker_assignment`

**Level:** refactor (absorbs Level 4) · **Status:** Done — amended by task 21

> **Amended by task 21.** The `package` / `locker_assignment` split stays. What changed: no
> `fk_package_customer` (there is no `customer` table), and `RegisterPackageService` no longer
> looks the customer up — `customerId` is an opaque upstream reference. `CustomerNotFoundError`
> and the `CustomersModule` import are gone.

## Why

The `package` table welds two concepts together: the **parcel** (customer, size, tracking ref —
known upstream, before any locker) and the **storage episode** (locker, `stored_at`,
`retrieved_at`, pickup code, fee — exists only once it's physically dropped). In any real system a
package is registered by an order/carrier feed and *then* an agent drops it; our model should have
that seam even though the brief only exercises the drop.

Splitting the table is the clean way to split the actions — the alternative (nullable `locker_id` +
`status` + `CHECK` carve-outs on one table) is strictly worse. This also rewrites the store path, so
**Level 4 concurrency handling is built in here** rather than bolted on later.

## Target schema (`001_init.sql`, edited in place — no deployments)

```sql
CREATE TABLE package (
  id           CHAR(36)     PRIMARY KEY,
  customer_id  CHAR(36)     NOT NULL,
  size_code    VARCHAR(20)  NOT NULL,
  tracking_ref VARCHAR(120) NULL,
  status       VARCHAR(20)  NOT NULL,          -- REGISTERED | STORED | RETRIEVED
  created_at   DATETIME(6)  NOT NULL,
  updated_at   DATETIME(6)  NOT NULL,
  -- task 21: customer_id is an opaque upstream reference — no `customer` table, no FK
  CONSTRAINT chk_package_size   CHECK (size_code IN ('SMALL','MEDIUM','LARGE')),
  CONSTRAINT chk_package_status CHECK (status IN ('REGISTERED','STORED','RETRIEVED'))
);

CREATE TABLE locker_assignment (
  id                CHAR(36)     PRIMARY KEY,
  package_id        CHAR(36)     NOT NULL,
  locker_id         CHAR(36)     NOT NULL,
  pickup_code_hash  CHAR(64)     NOT NULL,
  stored_by_agent   VARCHAR(120) NULL,
  stored_at         DATETIME(6)  NOT NULL,
  retrieved_at      DATETIME(6)  NULL,
  storage_fee_minor BIGINT       NULL,
  active_locker_id CHAR(36)
    GENERATED ALWAYS AS (IF(retrieved_at IS NULL, locker_id, NULL)) STORED,
  UNIQUE KEY uq_one_active_assignment_per_locker (active_locker_id),
  KEY ix_locker_assignment_package (package_id, stored_at),
  CONSTRAINT fk_assignment_package FOREIGN KEY (package_id) REFERENCES package (id),
  CONSTRAINT fk_assignment_locker  FOREIGN KEY (locker_id)  REFERENCES locker (id),
  CONSTRAINT chk_assignment_retrieved_after_stored
    CHECK (retrieved_at IS NULL OR retrieved_at >= stored_at),
  CONSTRAINT chk_assignment_fee_iff_retrieved
    CHECK ((retrieved_at IS NULL) = (storage_fee_minor IS NULL)),
  CONSTRAINT chk_assignment_fee_non_negative
    CHECK (storage_fee_minor IS NULL OR storage_fee_minor >= 0)
);
```

`002_seed.sql` is unaffected (it only seeds the station + rates).

## Domain (`src/packages/domain/`)

One aggregate: `Package` is the root, `LockerAssignment` a child entity it owns.

- `package-status.ts` — `REGISTERED | STORED | RETRIEVED`.
- `locker-assignment.entity.ts` — `id`, `lockerId`, `pickupCodeHash`, `storedByAgent`, `storedAt`,
  `retrievedAt`, `storageFeeMinor`; `get isActive()`. Immutable; `close({ now, storageFeeMinor })`
  returns a closed copy (clamps `retrievedAt` to `storedAt`).
- `package.entity.ts` — reshaped:
  - fields: `id`, `customerId`, `size: LockerSize`, `trackingRef`, `status`, timestamps,
    `assignment: LockerAssignment | null`.
  - `static register({ id, customerId, size, trackingRef, now })` → status `REGISTERED`, no
    assignment.
  - `storeInLocker({ assignmentId, lockerId, pickupCodeHash, storedByAgent, now }): Package` —
    guard `status === REGISTERED` else `PackageAlreadyStoredError`; returns a copy with
    `status = STORED` and a fresh active `assignment`.
  - `retrieve({ now, storageFeeMinor }): Package` — guard `status === STORED` and
    `assignment.isActive` else `PackageAlreadyRetrievedError`; returns a copy with
    `status = RETRIEVED` and a closed `assignment`.
  - `get pickupCodeHash()` / `get lockerId()` delegate to the active assignment (used by retrieval).
- `errors.ts` — add `PackageNotFoundError extends NotFoundDomainError` (`package_not_found`) and
  `PackageAlreadyStoredError extends ConflictDomainError` (`package_already_stored`); keep
  `NoSuitableLockerError`, `LockerJustTakenError`, `PickupCodeCollisionError`,
  `PackageNotFoundForRetrievalError`, `PackageAlreadyRetrievedError`.
- `storage-fee.policy.ts` — `StorageFeeInput` unchanged (`size`, `storedAt`, `retrievedAt`).

## Repository (`src/packages/`)

`PackageRepository` port:

| method | does |
|---|---|
| `save(pkg)` | insert a `REGISTERED` package (`package` row only) |
| `findById(id)` | load the package + its active assignment (if `STORED`); null if absent |
| `findActiveByLocker(lockerId)` | package with active assignment where `active_locker_id = ?` |
| `reserveLockerAndStore(params)` | **one transaction**: `SELECT … FROM locker … FOR UPDATE OF l SKIP LOCKED LIMIT 1` (smallest fit, free, in-service), `null` ⇒ return null; `INSERT locker_assignment`; `UPDATE package SET status='STORED', updated_at=? WHERE id=? AND status='REGISTERED'` (0 rows ⇒ `PackageAlreadyStoredError`); map `ER_DUP_ENTRY` on `active_locker_id` to `LockerJustTakenError`; return `{ lockerId, lockerCode }` |
| `saveRetrieval(pkg)` | `UPDATE locker_assignment SET retrieved_at=?, storage_fee_minor=? WHERE id=? AND retrieved_at IS NULL` (0 rows ⇒ `PackageAlreadyRetrievedError`); `UPDATE package SET status='RETRIEVED', updated_at=?` |

- `src/shared/database/size-order.ts` — `sizeOrderExpr(col)` → `FIELD(col,'SMALL','MEDIUM','LARGE')`,
  shared by both mysql repos (replaces the local `sizeRank` in `mysql-locker.repository.ts`).
- `mysql-locker.repository.ts` — **remove** `findAvailableSmallestFit` (the locker SELECT now lives
  inside `reserveLockerAndStore`); `listWithOccupancy` / `findById` stay.

## Application + interface (`src/packages/`)

- `register-package.service.ts` — `RegisterPackageService.register({ size, customerId, trackingRef })`:
  `LockerSize.of`; `Package.register`; `packages.save`. Returns `{ packageId, status: 'REGISTERED' }`.
  (Task 21: `customerId` is an opaque upstream reference — not resolved, so no
  `CustomerRepository` / `CustomerNotFoundError` / `CustomersModule` import.)
- `store-package.service.ts` — `StorePackageService.store({ packageId, agentId, stationId? })`:
  `packages.findById` ⇒ `PackageNotFoundError`; bounded retry loop (`MAX_ATTEMPTS = 3`): generate
  pickup code, `pkg.storeInLocker(...)` (in-memory guard), `reserveLockerAndStore(...)`; retry on
  `LockerJustTakenError` / `PickupCodeCollisionError`; `null` ⇒ `NoSuitableLockerError`. Returns
  `{ packageId, lockerId, lockerCode, pickupCode, status: 'STORED' }`.
- `retrieve-package.service.ts` — unchanged flow, but on `pkg` (with assignment):
  `packages.findActiveByLocker` ⇒ `PackageNotFoundForRetrievalError`; verify hash against
  `pkg.pickupCodeHash`; `fee = policy.calculate({ size: pkg.size, storedAt: pkg.assignment.storedAt, retrievedAt: now })`;
  `pkg.retrieve({ now, storageFeeMinor: fee })`; `packages.saveRetrieval(retrieved)`. Response shape
  unchanged (`packageId, lockerId, lockerCode, retrievedAt, storageFee, opened`).
- `packages.controller.ts`:
  - `POST /packages` `@Auth(AGENT)` → register `{ size, customerId (uuid), trackingRef? }`
    → 201 `{ packageId, status }`.
  - `POST /packages/:id/store` `@Auth(AGENT)` → 200 `{ packageId, lockerId, lockerCode, pickupCode, status }`.
  - `POST /packages/retrieve` `@Auth(CUSTOMER)` → unchanged.
- `packages.module.ts` — add `RegisterPackageService`. (Task 21 removed the `CustomersModule`
  import.)
- `dto/register-package.dto.ts` — `size` (`@IsIn`), `customerId` (`@IsUUID`), `trackingRef?`
  (string, ≤120). The old nested-customer DTO is removed.
- `lockers` — `ListLockersService` / `MysqlLockerRepository.listWithOccupancy`: `LEFT JOIN
  locker_assignment la ON la.active_locker_id = l.id`; keep exposing `activePackageId`
  (= `la.package_id`).

## Unit tests to rewrite

`package.entity.spec.ts` (register → store → retrieve transitions + guards),
`locker-assignment.entity.spec.ts` (new), `store-package.service.spec.ts`,
`register-package.service.spec.ts` (new — registers against a `customerId`; task 21 dropped the
"customer exists" check), `retrieve-package.service.spec.ts`,
`list-lockers.service.spec.ts` / `create-locker.service.spec.ts` fakes (drop
`findAvailableSmallestFit`, add the new port methods).

## Acceptance criteria

- [ ] Fresh `docker compose up -v` migrates to `package` + `locker_assignment`, no old `package`
  columns.
- [ ] `npm run lint` / `npm run build` / `npm run test` green.
- [ ] Unit: `Package.register` → `storeInLocker` → `retrieve` transitions; storing a non-`REGISTERED`
  package throws `PackageAlreadyStoredError`; `StorePackageService` retries a `LockerJustTakenError`
  then succeeds and throws `NoSuitableLockerError` on `null` / after `MAX_ATTEMPTS`.
- [ ] Manual DB check: two interleaved `reserveLockerAndStore` calls (2 free lockers) get different
  lockers, no error.
