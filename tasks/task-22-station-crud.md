# Task 22 — Station CRUD (`/stations`)

**Level:** refactor · **Depends on:** 21 · **Status:** Done

## Why

`locker_station` existed in the schema from task 02 but had no API: the only station was the one
seeded in `002_seed.sql`, and `POST /lockers` took a `stationId` nothing validated. Two problems
followed.

1. **A client error surfaced as a server error.** A well-formed but unknown `stationId` reached the
   `fk_locker_station` foreign key, which `MysqlLockerRepository.save` didn't map (it only handled
   `ER_DUP_ENTRY`), so the global filter logged it as unhandled and answered **500**.
2. **`?stationId=` on `GET /lockers` was undiscoverable.** A client had no way to learn a station id
   except by reading the seed migration, and no way to create a second station except by editing it.

The earlier position — "stations are out of scope, like customers (task 21)" — doesn't hold on
inspection. Customers are genuinely another service's data: this system holds an opaque reference
and never resolves it. Stations are *this* system's data: `locker.station_id` has an FK to it,
`GET /lockers` joins it, `POST /lockers` accepts it. There is no upstream station service.

## Scope

**In**

- **New `src/stations/`** module, following the standard layering:
  - `domain/` — `LockerStation` entity (immutable, transitions return a new instance),
    `StationStatus` (`ACTIVE | DECOMMISSIONED`), `StationRepository` port, typed errors.
  - `application/` — `CreateStationService`, `ListStationsService`, `GetStationService`,
    `UpdateStationService`, `DecommissionStationService` (one use case each, each with a spec).
  - `infrastructure/` — `MysqlStationRepository`.
  - `interface/` — `StationsController` + `CreateStationDto` / `UpdateStationDto` /
    `ListStationsQueryDto`.
- **Endpoints** (all `OPERATOR`): `POST /stations`, `GET /stations`, `GET /stations/:id`,
  `PATCH /stations/:id`, `DELETE /stations/:id`.
- **`DELETE` decommissions, it does not erase.** `fk_locker_station` means a station with lockers
  can't be hard-deleted, and the row is the referent for the lockers' assignment history. So the
  status flips to `DECOMMISSIONED` (terminal), the station drops out of the default listing, and it
  refuses new lockers. `GET /stations/:id` still returns it; `?includeDecommissioned=true` lists it.
- **Guard:** decommissioning is refused with `409 station_not_empty` while any non-decommissioned
  locker still stands there — retiring it otherwise would strand lockers at a site that no longer
  exists. `StationRepository.countLiveLockers` reads the `locker` table from the stations adapter;
  it lives on this port rather than `LockerRepository` to keep the module graph acyclic (lockers
  already depends on stations).
- **`CreateLockerService` validates its station** — `StationNotFoundError` (404) for an unknown id,
  `StationDecommissionedError` (409) for a retired one. This is the 500 fix.
- **`MysqlLockerRepository.save` maps `ER_NO_REFERENCED_ROW_2`** → `StationNotFoundError`, covering
  the check-then-insert race the same way `ER_DUP_ENTRY` is already covered. New shared helper
  `isMissingReferenceError` in `shared/database/mysql-errors.ts`.
- **`migrations/001_init.sql`** (edited in place — no deployments): `locker_station` gains
  `status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'`, `updated_at DATETIME(6) NOT NULL`,
  `chk_station_status` and `ix_locker_station_status`. `002_seed.sql` supplies both new columns.
- **Wiring** — `StationsModule` exports `STATION_REPOSITORY`; `LockersModule` imports it;
  `AppModule` registers it.
- **Docs** — `README.md`, `docs/implementation-plan.md`, `api.http` (which also had the *wrong*
  default-station UUID hard-coded: all-zeros instead of the v4 `…-4000-8000-…` the seed uses).

**Out**

- **A unique constraint on `name`.** Two sites may legitimately share a label; the id is the
  identity. Nothing in the brief asks for it and it would need a schema change.
- **Reopening a decommissioned station.** Terminal is the simpler, more defensible rule: create a
  new one.
- **Moving lockers between stations.** See task 23 — `stationId` is fixed for a locker's life.

## Acceptance criteria

- [x] All five endpoints work end-to-end and are `OPERATOR`-only (403 for other roles, 401 without
      a token).
- [x] `POST /lockers` with an unknown `stationId` → `404 station_not_found` (was 500); with a
      decommissioned one → `409 station_decommissioned`.
- [x] `DELETE /stations/:id` with live lockers → `409 station_not_empty`; after those lockers are
      decommissioned it succeeds.
- [x] A decommissioned station is hidden from `GET /stations`, listed under
      `?includeDecommissioned=true`, still readable by id, and refuses `PATCH` and a second
      `DELETE` with `409 station_decommissioned`.
- [x] `npm run lint` / `npm run build` / `npm run test` green.
- [x] `npm run test:e2e` green — `test/locker-management.e2e-spec.ts` covers the above.

## Note for anyone with an existing database

`001_init.sql` is edited in place (the task-21 convention — there are no deployments), and the
migrator tracks files by name, so an already-migrated database will **not** pick the new columns up.
Recreate the volume (`docker compose down -v && docker compose up --build`), or apply the delta by
hand:

```sql
ALTER TABLE locker_station
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);
ALTER TABLE locker_station ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE locker_station ADD INDEX ix_locker_station_status (status);
ALTER TABLE locker_station
  ADD CONSTRAINT chk_station_status CHECK (status IN ('ACTIVE', 'DECOMMISSIONED'));
UPDATE locker_station SET updated_at = created_at;
```
