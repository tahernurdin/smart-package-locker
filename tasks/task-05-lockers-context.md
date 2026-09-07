# Task 05 — Lockers context

**Level:** 1 · **Depends on:** 02, 03, 04 · **Status:** Not started

## Goal

Operators can create lockers of a given size and list all lockers with service status and
availability.

## Scope

**In**

- `src/lockers/domain/`:
  - `locker-size.ts` — value object over the three sizes with a `rank` (SMALL 10, MEDIUM 20,
    LARGE 30) and `fits(required: LockerSize): boolean` (`this.rank >= required.rank`).
  - `locker-status.ts` — `IN_SERVICE` | `OUT_OF_SERVICE`.
  - `locker.entity.ts` — `id`, `stationId`, `code`, `size`, `status`, timestamps. Construction
    validates a non-empty `code`.
  - `locker.repository.ts` — port `LOCKER_REPOSITORY`:
    - `save(locker)`, `existsByStationAndCode(stationId, code)`,
    - `listWithOccupancy(): Promise<LockerWithOccupancy[]>` where occupancy = whether an active
      package references the locker,
    - `findAvailableSmallestFit(stationId, size): Promise<Locker | null>` (used by Task 07).
  - `errors.ts` — `LockerCodeTakenError extends ConflictDomainError`.
- `src/lockers/infrastructure/mysql-locker.repository.ts` — SQL implementation.
  `listWithOccupancy` LEFT JOINs `package ON package.active_locker_id = locker.id`.
- `src/lockers/application/`:
  - `create-locker.service.ts` — `createLocker({ code, size, stationId? })`: default station =
    the seeded one; reject a duplicate `(station, code)` with `LockerCodeTakenError`; persist via
    `IdGenerator` + `Clock`.
  - `list-lockers.service.ts` — `listLockers()` → array of
    `{ id, code, size, status, availability: 'FREE' | 'OCCUPIED', activePackageId? }`.
- `src/lockers/interface/`:
  - `dto/create-locker.dto.ts` — `code: string`, `size: 'SMALL'|'MEDIUM'|'LARGE'`,
    `stationId?: string (uuid)`.
  - `lockers.controller.ts` — `@Roles(OPERATOR)`:
    - `POST /lockers` → 201 `{ id, code, size, status }`
    - `GET /lockers` → 200 list from `ListLockersService`
  - `dto/locker-view.dto.ts` — response shape.
- `src/lockers/lockers.module.ts` — binds `LOCKER_REPOSITORY → MysqlLockerRepository`, imports
  auth + shared.

**Out**

- Allocation/reservation logic beyond the read query → Task 07.
- `OUT_OF_SERVICE` transitions (no endpoint in Level 1; default `IN_SERVICE`).

## Files

- create: everything under `src/lockers/**`
- create: `src/lockers/application/*.spec.ts`
- change: `src/app.module.ts`

## Acceptance criteria

- [ ] Unit tests (fake repo): `CreateLockerService` persists with generated id + clock timestamps;
  duplicate `(station, code)` throws `LockerCodeTakenError`.
- [ ] Unit test: `ListLockersService` reports `OCCUPIED` when the repo returns an active package,
  `FREE` otherwise.
- [ ] `POST /lockers` as OPERATOR creates; as AGENT → 403; no token → 401.
- [ ] `GET /lockers` returns created lockers with `availability: 'FREE'`.
- [ ] `LockerSize.fits` — MEDIUM fits a SMALL package, SMALL does not fit a LARGE package.
