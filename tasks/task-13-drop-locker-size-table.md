# Task 13 — Drop the `locker_size` reference table

**Level:** refactor · **Depends on:** 12 · **Status:** Done

## Why

Size is a fixed, compile-time set (`SMALL/MEDIUM/LARGE`). It's already modelled as an enum in the
app — the `LockerSize` value object, the `LOCKER_SIZES` array, `@IsIn(LOCKER_SIZES)` in DTOs. The
`locker_size` table on top of that duplicates the `rank` ordering (DB column **and** the VO's
`RANKS` map, kept in sync by a test) without delivering its payoff: adding a size still needs a code
change, so it can't be "just an `INSERT`".

A reference table earns its place only when the list is genuinely runtime-dynamic. Ours isn't.
Collapse to the enum; keep `rank` in one place.

## Scope

**In**

- `migrations/001_init.sql`:
  - Delete the `locker_size` table.
  - Drop FKs `fk_locker_size`, `fk_package_size`, `fk_storage_rate_size`.
  - Add `CHECK (size_code IN ('SMALL','MEDIUM','LARGE'))` to `locker`, `package`, `storage_rate`
    (same style as the existing `chk_locker_status`).
  - Edited in place (no deployments yet) — existing dev volumes need
    `docker compose down -v`.
- `migrations/002_seed.sql`: remove the `locker_size` seed block (station + rates stay).
- `src/lockers/domain/locker-size.ts`: it is now the sole source of the size set + ordering —
  update the comment; no behaviour change.
- `src/lockers/infrastructure/mysql-locker.repository.ts`:
  - `listWithOccupancy` / `findAvailableSmallestFit`: drop `JOIN locker_size`.
  - Order by `FIELD(l.size_code, 'SMALL','MEDIUM','LARGE')` instead of `s.rank`.
  - Fit filter: `FIELD(l.size_code, …) >= FIELD(:requiredCode, …)` instead of `s.rank >= :rank`.
- `src/lockers/domain/locker-size.spec.ts`: delete the "ranks match 002_seed.sql" test.
- `docs/implementation-plan.md`: note the reference-table decision was reversed.

**Out**

- Any change to `LockerSize`'s public API, the domain `fits()` logic, or the DTOs.
- Runtime-configurable sizes (that's the *other* direction, and not needed).

## Files

- change: `migrations/001_init.sql`, `migrations/002_seed.sql`,
  `src/lockers/domain/locker-size.ts`, `src/lockers/domain/locker-size.spec.ts`,
  `src/lockers/infrastructure/mysql-locker.repository.ts`, `docs/implementation-plan.md`

## Acceptance criteria

- [ ] Fresh `docker compose up -v` migrates with no `locker_size` table; `SHOW CREATE TABLE locker`
  includes the size CHECK.
- [ ] Inserting a `locker` with `size_code = 'HUGE'` fails the CHECK.
- [ ] `npm run lint` / `npm run build` / `npm run test` green (one fewer test — the parity check).
- [ ] `npm run test:e2e` green: Level 1 smallest-fit and Level 2 retrieval unchanged.
