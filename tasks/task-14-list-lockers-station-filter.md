# Task 14 — `GET /lockers`: station filter + station in the response

**Level:** refactor · **Depends on:** 13 · **Status:** Done

## Why

`GET /lockers` returns every locker with no station context, and the schema already anticipates
multi-station. Add the one filter that matters — by station id — and make each row say which station
it belongs to so a filtered result is self-describing.

Deliberately **not** adding pagination or sorting: a locker bank is bounded and small, and the list
is already deterministically ordered (size rank, then code). The repository method takes an options
object so `{ limit, cursor, sort }` can be added later without touching callers.

## Scope

**In**

- `src/lockers/domain/locker.repository.ts`:
  - `LockerOccupancy` gains `station: { id: string; name: string; location: string | null }`.
  - `listWithOccupancy(filter?: { stationId?: string }): Promise<LockerOccupancy[]>`.
- `src/lockers/infrastructure/mysql-locker.repository.ts`:
  - `listWithOccupancy` — `JOIN locker_station st ON st.id = l.station_id`, optional
    `WHERE l.station_id = :stationId`, select `st.name` / `st.location`.
- `src/lockers/application/list-lockers.service.ts`:
  - `listLockers(filter?: { stationId?: string })`.
  - `LockerView` gains flat `stationId`, `stationName`, `location: string | null`.
- `src/lockers/interface/`:
  - `dto/list-lockers-query.dto.ts` — `@IsOptional() @IsUUID() stationId?: string`.
  - `lockers.controller.ts` — `list(@Query() query: ListLockersQueryDto)`.
- `README.md` — add `?stationId=` to the endpoints table; add a short note on why the endpoint is
  unpaginated/unsorted.
- Fakes that implement `LockerRepository` (`create-locker.service.spec.ts`) return the new
  `station` field.

**Out**

- Pagination, sorting, `?availability=` filter, a `GET /stations` endpoint.
- Any change to `POST /lockers` or the allocator query.

> Surfaced a latent bug: `DEFAULT_STATION_ID` was `00000000-0000-0000-0000-000000000001`, not a
> valid v4 UUID, so it failed `@IsUUID()` the moment it went through a query/body. Reseeded as
> `00000000-0000-4000-8000-000000000000`.

## Files

- change: `src/lockers/domain/locker.repository.ts`,
  `src/lockers/infrastructure/mysql-locker.repository.ts`,
  `src/lockers/application/list-lockers.service.ts`,
  `src/lockers/application/list-lockers.service.spec.ts`,
  `src/lockers/interface/lockers.controller.ts`,
  `src/lockers/application/create-locker.service.spec.ts`, `README.md`
- create: `src/lockers/interface/dto/list-lockers-query.dto.ts`
- change: `test/level1.e2e-spec.ts` (assert station fields + a `?stationId=` filter case)

## Acceptance criteria

- [ ] `GET /lockers` rows include `stationId`, `stationName`, `location`.
- [ ] `GET /lockers?stationId=<seeded>` returns the lockers; `?stationId=<other valid uuid>` → `[]`;
  `?stationId=not-a-uuid` → 400.
- [ ] `npm run lint` / `npm run build` / `npm run test` / `npm run test:e2e` green.
