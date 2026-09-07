# Task 19 — Level 4 contention e2e + docs

**Level:** 4 (optional) · **Depends on:** 18 · **Status:** Not started

## Goal

Prove the store path stays correct and fair when many agents hit it at once.

## Scope

**In**

- `test/level4.e2e-spec.ts` (real MySQL; `beforeEach` clears `package` / `locker` / `customer`):
  1. **More requests than lockers.** Operator creates `M` MEDIUM lockers. Fire `N` (`N > M`, e.g.
     `M = 3`, `N = 10`) `POST /packages` concurrently (`Promise.all`).
     - exactly `M` return `201`; the rest return `409 no_suitable_locker`.
     - the `M` successes reference `M` **distinct** `lockerId`s.
     - `GET /lockers` → all `M` lockers `OCCUPIED`, none free.
     - `SELECT COUNT(*) FROM package` = `M`.
  2. **Fan-out, no false negatives.** Operator creates exactly `N` lockers; fire `N` concurrent
     stores → all `N` succeed, `N` distinct lockers, zero `409`.
  3. **Mixed sizes.** A few SMALL + a few LARGE lockers; concurrent SMALL and LARGE stores →
     smallest-fit still honoured per request, no cross-assignment, no double-book.
  4. **Higher volume** (smoke): `N = 40` concurrent stores against `40` lockers → all succeed,
     distinct lockers. Keep the assertion cheap (count distinct `lockerId`s).
- `README.md` — a "Concurrency" note: the DB unique index is the correctness backstop;
  `FOR UPDATE SKIP LOCKED` + bounded retry is the fairness/efficiency layer; retrieval concurrency
  was handled in L2. Mark Level 4 ✅.
- `docs/implementation-plan.md` — tick Level 4 in the levels mapping.
- `tasks/README.md` — Level 4 statuses.

**Out**

- Load-testing tooling / benchmarks beyond the smoke test.
- Multi-process testing (single Node process with `Promise.all` is enough to exercise the DB-level
  locking).

## Files

- create: `test/level4.e2e-spec.ts`
- change: `README.md`, `docs/implementation-plan.md`, `tasks/README.md`

## Acceptance criteria

- [ ] `docker compose up -d mysql && npm run test:e2e` — all levels green including `level4`.
- [ ] Case 1: exactly `M` of `N` succeed, `M` distinct lockers, `N − M` × `409`.
- [ ] Case 2: `N` of `N` succeed with `N` distinct lockers (no spurious `no_suitable_locker`).
- [ ] `npm run lint` / `npm run build` / `npm run test` green.
