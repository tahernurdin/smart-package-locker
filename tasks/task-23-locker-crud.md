# Task 23 — Locker CRUD (`GET`/`PATCH`/`DELETE /lockers/:id`)

**Level:** refactor · **Depends on:** 22 · **Status:** Done

## Why

`locker` is the core resource of the system and had only `POST` and `GET` (list). Task 22 gave
`locker_station` a full CRUD; leaving the *container* with more lifecycle management than the thing
it contains would be backwards. An operator managing a locker bank needs to relabel a box, take one
out of service for maintenance, and retire one that's been removed from the wall.

The schema already anticipated this: `chk_locker_status` has carried
`IN_SERVICE | OUT_OF_SERVICE` since task 02, and the allocator has always filtered on
`status = 'IN_SERVICE'` — but nothing could ever *set* `OUT_OF_SERVICE`.

## Scope

**In**

- **`GET /lockers/:id`** — one locker with the same row shape the list returns (occupancy +
  station flattened on). `404 locker_not_found` for an unknown id.
- **`PATCH /lockers/:id`** — `code` and/or `status`. Sends only what changes.
- **`DELETE /lockers/:id`** — decommission (see below).
- **`DECOMMISSIONED` added to `LockerStatus`** and to `chk_locker_status` in
  `migrations/001_init.sql` (edited in place). Terminal, and excluded from the allocator for free:
  it already takes only `IN_SERVICE`.
- **`Locker` entity gains transitions** — `update({ code?, status?, now })` and
  `decommission(now)`, both returning a new instance and both refusing to touch a decommissioned
  locker (`LockerDecommissionedError`). New `locker.entity.spec.ts`.
- **`LockerRepository` gains `update` and `findByIdWithOccupancy`**; `ListLockersFilter` gains
  `includeDecommissioned`. `MysqlLockerRepository.update` maps `ER_DUP_ENTRY` to
  `LockerCodeTakenError` the way `save` does.
- **New services** — `GetLockerService`, `UpdateLockerService`, `DecommissionLockerService`, each
  with a spec.
- **One row shape for every `/lockers` response.** `LockerView` and its mapper move out of
  `ListLockersService` into `application/locker.view.ts`; `CreateLockerService` now returns the same
  view (it has the station in hand from the task-22 check), so `POST`, `GET`, `GET /:id`, `PATCH`
  and `DELETE` all answer identically. Additive for existing clients — the create response gained
  fields, lost none.
- **Retired lockers are hidden** from `GET /lockers` unless `?includeDecommissioned=true`, matching
  stations.

**Out**

- **Editing `size` or `stationId`.** Both describe the hardware and where it is bolted. A box that
  changed size would invalidate the allocation already made for whatever is inside it, and lockers
  don't move between sites. The DTO rejects both outright (`400`); the operator retires the locker
  and creates its replacement.
- **Setting `DECOMMISSIONED` through `PATCH`.** `UpdateLockerDto.status` accepts only the live
  statuses (`LIVE_LOCKER_STATUSES`), so retirement always goes through `DELETE`, which enforces
  that the locker is empty first. A status edit would bypass that guard.
- **Hard delete.** `locker_assignment.locker_id` has an FK to `locker`, and the storage history
  backs the fee calculation and any audit — the row has to survive.

## Guards

| Attempt | Result |
| --- | --- |
| `DELETE` a locker holding a package | `409 locker_occupied` |
| `DELETE` / `PATCH` an already-decommissioned locker | `409 locker_decommissioned` |
| `PATCH` a `code` already used at that station | `409 locker_code_taken` |
| `PATCH` a locker's `code` to its own current code | `200` — a no-op, not a clash |
| `PATCH` `size` / `stationId` / `status: DECOMMISSIONED` | `400` (rejected by the DTO) |

## Acceptance criteria

- [x] `GET /lockers/:id` returns the list row shape; `404 locker_not_found` when unknown.
- [x] `PATCH` renames and toggles `IN_SERVICE` ↔ `OUT_OF_SERVICE`; every guard above holds.
- [x] `DELETE` on an empty locker retires it; it disappears from `GET /lockers`, appears under
      `?includeDecommissioned=true`, and is no longer allocated by `POST /packages/:id/store`.
- [x] `DELETE` on an occupied locker → `409 locker_occupied`; after the customer retrieves the
      package it succeeds.
- [x] An `OUT_OF_SERVICE` locker is not allocated (`409 no_suitable_locker` when it's the only fit).
- [x] `npm run lint` / `npm run build` / `npm run test` green.
- [x] `npm run test:e2e` green — `test/locker-management.e2e-spec.ts` covers the above, and the
      Level 1–3 suites still pass unchanged.
