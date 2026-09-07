# Task 17 — Wire the tiered policy + Level 3 end-to-end + docs

**Level:** 3 · **Depends on:** 16 · **Status:** Done

## Goal

Flip `STORAGE_FEE_POLICY` to the tiered implementation and prove the fee end to end, including the
"a later rate change never rewrites a past charge" property.

## Scope

**In**

- `src/packages/packages.module.ts`:
  - `{ provide: STORAGE_RATE_REPOSITORY, useClass: MysqlStorageRateRepository }`
  - `{ provide: STORAGE_FEE_POLICY, useClass: TieredStorageFeePolicy }` (replacing the flat-zero
    binding).
- Confirm `RetrievePackageService` is unchanged and still snapshots the fee into
  `package.storage_fee_minor` via `markRetrieved`.
- `test/level3.e2e-spec.ts` — override `CLOCK` with a mutable fake so time can be advanced:
  1. Fake clock at `T0`. Operator creates a SMALL locker; agent stores a package → `stored_at = T0`.
  2. Advance the clock to `T0 + 7 days`. Customer retrieves → `storageFee.amountMinor === 4600`,
     `storageFee.currency` from config.
  3. `SELECT storage_fee_minor` for that package → `4600` (snapshotted).
  4. Same-instant case: store another, retrieve with the clock unchanged → fee `0`.
  5. Snapshot immutability: `UPDATE storage_rate SET rate_minor = rate_minor * 10 WHERE size_code='SMALL'`;
     a *new* store+retrieve (7 days) now costs `46000`, but step 3's package still reads `4600`.
- `test/storage-rate-seed.spec.ts` (or fold into an existing spec) — the seeded bands per size are
  **gapless from day 0** and end with an open-ended tail. This is the check that replaces Postgres's
  `EXCLUDE USING gist` (noted back in Task 02).
- `README.md`:
  - New "Storage fees" section: the 24h-day rule, the tiered table, snapshot-at-retrieval.
  - Update the retrieve walkthrough / example — the fee is real now, not always `0`.
  - Mark Level 3 ✅ in the status table.
- `docs/implementation-plan.md` — tick Level 3 in the levels mapping.
- `api.http` — a comment on the retrieve block noting the fee depends on elapsed time (can't be
  exercised from a static request file).

**Out**

- L4 concurrency.

## Files

- change: `src/packages/packages.module.ts`, `README.md`, `docs/implementation-plan.md`,
  `api.http`, `tasks/README.md`
- create: `test/level3.e2e-spec.ts`, `test/storage-rate-seed.spec.ts`

## Acceptance criteria

- [ ] `docker compose up -d mysql && npm run test:e2e` — Level 1 / 2 / 3 specs all green.
- [ ] A 7-day SMALL retrieval returns and stores `4600`; a same-instant retrieval returns `0`.
- [ ] After a rate hike, previously retrieved packages keep their snapshotted fee.
- [ ] `npm run lint` / `npm run build` / `npm run test` green; no `FlatZeroStorageFeePolicy` left.
