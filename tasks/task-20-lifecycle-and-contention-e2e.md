# Task 20 — Lifecycle + Level 4: coverage decision & docs

**Level:** refactor / Level 4 · **Depends on:** 19, 21 · **Status:** ✅ Done

## Goal

Close out the `register → store → retrieve` lifecycle reshape and Level 4: the e2e suite tells the
new story end to end, and the concurrency guarantees are written down against the coverage that
actually exists.

The Level 4 *mechanism* shipped with the store-path rewrite in task 19 — `FOR UPDATE … SKIP LOCKED`
allocation inside the assignment transaction, `uq_one_active_assignment_per_locker` as the
correctness backstop, and a bounded retry on a lost race. This task is what remained around it.

## Decision: no dedicated `test/level4.e2e-spec.ts`

Originally this task specified a four-case contention suite. It is **deliberately not written**.
The mechanism is already covered at two levels:

- **Unit** — `store-package.service.spec.ts`: "retries a lost allocation race, then succeeds" and
  "gives up after repeated allocation races" drive the retry loop through a fake repository.
- **E2E** — `level1.e2e-spec.ts`: 8 concurrent stores against a single locker → exactly one `200`
  and exactly one `locker_assignment` row. `level2.e2e-spec.ts`: 6 concurrent retrievals of one
  package → exactly one `200`.

**Known gap, accepted.** With one locker, a design that serialises every agent onto the same row and
a design that fans them out across lockers are indistinguishable — both yield one winner. Only
`M` lockers against `N > M` concurrent stores separates them. So what is *not* proven end to end is
the fairness property `SKIP LOCKED` exists for:

1. **More requests than lockers.** `M = 3` MEDIUM lockers, `N = 10` concurrent stores → exactly `M`
   × `200` on `M` **distinct** lockers, `N − M` × `409 no_suitable_locker`, `M` rows in
   `locker_assignment`, the unstored packages still `REGISTERED`.
2. **Fan-out, no false negatives.** `N` lockers, `N` concurrent stores → all `200`, `N` distinct
   lockers, zero spurious `409`.
3. **Mixed sizes.** Concurrent SMALL and LARGE stores → smallest-fit honoured per request, no
   cross-assignment.
4. **Smoke.** `N = 40` lockers / packages / concurrent stores.

Correctness is not at risk either way — the unique index over the generated `active_locker_id`
column makes a double-book unrepresentable regardless of how the lock behaves. What is untested is
throughput under contention. Pick this up if allocation ever looks like it is queueing.

## Scope

**In (done)**

- **Reshaped e2e** for `register → store → retrieve` (landed in task 21): `POST /packages`
  `{ size, customerId, trackingRef? }` → `POST /packages/:id/store` `{ stationId }` →
  `POST /packages/retrieve` `{ lockerId, pickupCode }`, with a shared `registerAndStore()` helper and
  a `CUSTOMER_ID` constant. Negative cases: register accepts any `customerId` (never resolved) →
  201; store an unknown package id → 404 `package_not_found`; store the same package twice → 409
  `package_already_stored`.
- **`README.md`** — "Package lifecycle" (`REGISTERED → STORED → RETRIEVED` across `package` +
  `locker_assignment`) and "Concurrency (Level 4)": the three layers, the allocation index, and an
  explicit statement of what is proven today versus what the fan-out suite would have added.
- **`docs/implementation-plan.md`** — Level 4 in the levels mapping.
- **`tasks/README.md`** — statuses.

**Out**

- `test/level4.e2e-spec.ts` — see the decision above.
- Load-testing tooling; multi-process testing.

## Files

- change: `README.md`, `docs/implementation-plan.md`, `tasks/README.md`
- (task 21 carried the `test/level1|2|3.e2e-spec.ts` reshape and `api.http`)

## Acceptance criteria

- [x] `docker compose up -d mysql && npm run test:e2e` — green.
- [x] `npm run lint` / `npm run build` / `npm run test` green.
- [x] The lifecycle e2e covers register → store → retrieve plus the three negative cases.
- [x] Concurrency coverage and its limits are documented rather than implied.
