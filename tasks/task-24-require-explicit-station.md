# Task 24 — Drop `DEFAULT_STATION_ID`; require an explicit `stationId`

**Level:** refactor · **Depends on:** 22, 23 · **Status:** Done

## Why

`DEFAULT_STATION_ID` was a hardcoded UUID in `lockers/application/create-locker.service.ts`
pointing at the row seeded by `002_seed.sql`. It existed because there was no way to create a
station, so `POST /lockers` needed *some* station to fall back on. Task 22 added `POST /stations`,
which removes the reason.

It was also a smell on two counts:

- **Application code hardcoding a seed row's primary key.** The constant lived in the lockers
  context but was imported by `packages` (the store path) and by three e2e suites — a magic id
  reaching across three modules.
- **A silent, invisible default.** `POST /packages/:id/store` took no station at all and quietly
  allocated from the seeded one. With more than one station that is wrong, not just implicit: an
  agent standing at the North depot would have their parcel allocated to a locker at HQ.

## Scope

**In**

- **Delete `DEFAULT_STATION_ID`** and every fallback (`input.stationId ?? DEFAULT_STATION_ID`).
- **`POST /lockers`** — `CreateLockerDto.stationId` loses `@IsOptional()`; `CreateLockerInput.stationId`
  becomes `string`. A missing one is now `400`, not a silent default.
- **`POST /packages/:id/store`** — gains a required body `{ stationId }` (new `StorePackageDto`);
  `StorePackageInput.stationId` becomes `string`. The agent names the station they're standing at.
  Allocation has always been per-station (`reserveLockerAndStore` filters on `station_id`); this
  makes the input to that filter explicit rather than assumed.
- **The store path validates that station**, the same way `CreateLockerService` does:
  `StationNotFoundError` (404) for an unknown id, `StationDecommissionedError` (409) for a retired
  one. Without it, an unknown station simply matched no lockers and came back as
  `409 no_suitable_locker` — indistinguishable from a station that is genuinely full, which is the
  wrong answer to give an agent holding a parcel. `PackagesModule` imports `StationsModule` for
  `STATION_REPOSITORY`; the graph stays acyclic (`packages → lockers → stations`).
- **`migrations/002_seed.sql`** — the seeded station stays, so a fresh deployment has somewhere to
  start, but the comment no longer calls it a default.
- **`test/seeded-station.ts`** — new test fixture exporting `SEEDED_STATION_ID`. The seed row's id
  is a test concern now; nothing in `src/` refers to it.
- **Specs and e2e** updated to pass an explicit station throughout, plus a new e2e case asserting
  both endpoints `400` without one.
- **Docs** — `README.md` (assumptions, walkthrough now creates a station first, endpoints table),
  `docs/implementation-plan.md`, `api.http` (`@seededStation`, renamed from `@defaultStation`).

**Out**

- **Deriving the station from the agent's token.** Tempting (an agent belongs to a depot), but the
  JWT carries only `sub` and `role`, and inventing an agent→station assignment is a bigger model
  change than the brief supports.
- **Removing the seeded station.** It costs nothing and saves a fresh deployment from a
  chicken-and-egg first request.

## Acceptance criteria

- [x] `rg DEFAULT_STATION_ID src test` returns nothing.
- [x] `POST /lockers` without `stationId` → `400`; with one → `201`.
- [x] `POST /packages/:id/store` with no body → `400`; with `{ stationId }` → `200`.
- [x] Storing at an unknown station → `404 station_not_found`; at a decommissioned one →
      `409 station_decommissioned`. Neither touches the parcel — it stays storable.
- [x] Storing only ever allocates a locker at the named station.
- [x] `npm run lint` / `npm run build` / `npm run test` green.
- [x] `npm run test:e2e` green — Levels 1–3 updated to pass an explicit station, and
      `test/locker-management.e2e-spec.ts` covers the two `400`s.
