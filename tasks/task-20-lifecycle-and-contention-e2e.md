# Task 20 — Lifecycle + Level 4 contention: e2e & docs

**Level:** refactor / Level 4 · **Depends on:** 19 · **Status:** Not started

## Goal

Reshape the e2e suite for the `create customer → register → store → retrieve` flow and prove the
store path holds up under concurrency (Level 4).

## Scope

**In**

- **Reshape existing e2e** (`level1` / `level2` / `level3`): the happy path is now
  1. `POST /customers` `{ name, email }` → `{ customerId }`
  2. `POST /packages` `{ size, customerId, trackingRef? }` → `{ packageId, status: 'REGISTERED' }`
  3. `POST /packages/:id/store` → `{ lockerId, lockerCode, pickupCode, status: 'STORED' }`
  4. `POST /packages/retrieve` `{ lockerId, pickupCode }` → unchanged
  Add shared `createCustomer()` and `registerAndStore()` helpers. `GET /lockers` still reports
  `activePackageId`.
  New negative cases: register with an unknown `customerId` → 404 `customer_not_found`; store an
  unknown package id → 404 `package_not_found`; store the same package twice → 409
  `package_already_stored`.
- **`test/level4.e2e-spec.ts`** (real MySQL; `beforeEach` clears `locker_assignment` / `package` /
  `locker` / `customer`):
  1. **More requests than lockers.** Operator creates `M = 3` MEDIUM lockers. Register `N = 10`
     packages, then fire `N` `POST /packages/:id/store` concurrently (`Promise.all`).
     - exactly `M` return `200`, the rest `409 no_suitable_locker`.
     - the `M` successes reference `M` **distinct** `lockerId`s.
     - `GET /lockers` → all `M` `OCCUPIED`.
     - `SELECT COUNT(*) FROM locker_assignment` = `M`; the `M` stored packages have
       `status = 'STORED'`, the rest `'REGISTERED'`.
  2. **Fan-out, no false negatives.** `N` lockers, `N` registered packages, `N` concurrent stores →
     all `200`, `N` distinct lockers, zero `409`.
  3. **Mixed sizes.** A few SMALL + a few LARGE lockers; concurrent SMALL and LARGE stores →
     smallest-fit honoured per request, no cross-assignment, no double-book.
  4. **Smoke.** `N = 40` lockers / packages / concurrent stores → all succeed, 40 distinct lockers.
- **`README.md`**:
  - "Package lifecycle" note: `REGISTERED → STORED → RETRIEVED`; a customer is created via
    `POST /customers`, a package registered against a `customerId` via `POST /packages` (the seam a
    carrier/order feed would call), and `POST /packages/:id/store` is the agent's drop.
  - "Concurrency" note: `uq_one_active_assignment_per_locker` is the correctness backstop;
    `FOR UPDATE … SKIP LOCKED` + bounded retry is the fairness layer; retrieval concurrency was
    handled in L2.
  - Update the endpoints table + the curl walkthrough (create customer → register → store).
  - Mark Level 4 ✅.
- **`docs/implementation-plan.md`** — the two-table model, the `POST /customers` endpoint, and
  Level 4 in the levels mapping.
- **`api.http`** — add a `POST /customers` block; split the store block into register + store.
- **`tasks/README.md`** — statuses.

**Out**

- Load-testing tooling beyond the smoke test; multi-process testing (one Node process +
  `Promise.all` exercises the DB locking fine).

## Files

- create: `test/level4.e2e-spec.ts`
- change: `test/level1.e2e-spec.ts`, `test/level2.e2e-spec.ts`, `test/level3.e2e-spec.ts`,
  `README.md`, `docs/implementation-plan.md`, `api.http`, `tasks/README.md`

## Acceptance criteria

- [ ] `docker compose up -d mysql && npm run test:e2e` — every level green including `level4`.
- [ ] Case 1: exactly `M` of `N` stores succeed, `M` distinct lockers, `N − M` × `409`; unstored
  packages stay `REGISTERED`.
- [ ] Case 2: `N` of `N` succeed, `N` distinct lockers, no spurious `no_suitable_locker`.
- [ ] `npm run lint` / `npm run build` / `npm run test` green.
