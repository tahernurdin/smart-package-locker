# Task 12 — Level 2 end-to-end + docs

**Level:** 2 · **Depends on:** 11 · **Status:** Not started

## Goal

Prove the retrieval flow and its failure modes against a real MySQL, and document it.

## Scope

**In**

- `test/level2.e2e-spec.ts` (same setup as `level1.e2e-spec.ts` — migrations in `beforeAll`,
  `DELETE` the mutable tables in `beforeEach`):
  1. Operator creates a locker; agent stores a package → capture `lockerId` + `pickupCode`.
  2. `GET /lockers` → that locker `OCCUPIED`.
  3. Customer `POST /packages/retrieve` `{ lockerId, pickupCode }` → 200, `opened: true`,
     `storageFee.amountMinor === 0`, `storageFee.currency` from config.
  4. `GET /lockers` → the locker is `FREE` again, `activePackageId: null`.
  5. A fresh store into the same size now succeeds (locker reused).
  6. Retrieve the same locker+code again → 404 `retrieval_failed`.
  7. Wrong pickup code → 404 `retrieval_failed`. Unknown locker id → 404 `retrieval_failed`.
  8. Malformed body (`pickupCode: "12"`) → 400. As AGENT → 403. No token → 401.
  9. Concurrency: store one package, fire two simultaneous retrieves with the correct code →
     exactly one 200, the other 404 or 409; `SELECT COUNT(*) FROM package WHERE retrieved_at IS NOT NULL` is 1.
- `README.md` — add `POST /packages/retrieve` to the endpoints table and a retrieve step to the
  walkthrough; flip the Level 2 row to ✅.
- `tasks/README.md` — tick the Level 2 statuses.
- `api.http` — the retrieve blocks already exist; adjust only if the request/response shape drifted.

**Out**

- Fee-band assertions → Level 3 e2e.

## Files

- create: `test/level2.e2e-spec.ts`
- change: `README.md`, `tasks/README.md`, maybe `api.http`

## Acceptance criteria

- [ ] `docker compose up -d mysql && npm run test:e2e` passes `level1` + `level2` specs.
- [ ] `npm run lint` / `npm run build` / `npm run test` green.
- [ ] A reader can store then retrieve a package following only `README.md`.
