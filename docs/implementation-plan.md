# Implementation Plan — Smart Package Locker Management System

Everest Engineering coding challenge. NestJS REST service, MySQL, clean architecture, all 4 levels.

Brief: `Smart Package Everest Coding challenge.pdf`. Reference data model: `001_init.sql`
(PostgreSQL — adapted to MySQL below).

## Decisions

| Area | Choice | Why |
|---|---|---|
| DB access | `mysql2` pool + hand-written SQL in infrastructure repositories | Simple + clean architecture — no ORM decorators in the domain; infra owns SQL |
| Schema | `migrations/001_init.sql` (MySQL dialect) + small migration runner (`npm run db:migrate`, also runs on API boot) | `001_init.sql` is Postgres-only; a runner works for local + docker + e2e |
| IDs | App-generated UUID v4 stored as `CHAR(36)`, behind an `IdGenerator` port | Debuggable, deterministic in tests |
| Pickup code | 6-digit numeric; stored as SHA-256 hash; compared with `crypto.timingSafeEqual`; plaintext returned once | No native deps; codes are short-lived |
| Auth | `@nestjs/jwt` + `JwtAuthGuard` + `RolesGuard` + `@Roles()`; `POST /auth/dev-token` (env-gated) mints a token per role; the 3 tokens also print to the log on boot in dev | "Dummy JWT per role", minimal |
| Currency | Single value from config (`CURRENCY`, default `AUD`) | Matches schema note |
| Roles | `OPERATOR`, `AGENT`, `CUSTOMER` | Per challenge |

## MySQL schema adaptation

- `gen_random_uuid()` / `timestamptz` → `CHAR(36)` app-supplied, `DATETIME(6)` UTC app-supplied (via `Clock`).
- **Partial unique index** `one_active_package_per_locker` → STORED generated column
  `active_locker_id = IF(retrieved_at IS NULL, locker_id, NULL)` + `UNIQUE(active_locker_id)`.
  Same trick for the active pickup-code hash. This is the Level 4 correctness backstop — a race
  produces `ER_DUP_ENTRY (1062)`, not a double booking.
- `EXCLUDE USING gist` (no overlapping rate bands) → not expressible in MySQL; enforced by a
  seed/config test instead.
- `CHECK` constraints → kept (MySQL 8.0.16+ enforces them) → image `mysql:8.4`.
- `btree_gist`, `pgcrypto`, `int4range` → dropped.
- **`locker_size` reference table → dropped** (Task 13). Size is a fixed enum
  (`SMALL/MEDIUM/LARGE`) already modelled by the `LockerSize` value object, so the table only
  duplicated the `rank` ordering. `size_code` columns now carry a `CHECK`; the allocator query
  orders with `FIELD(size_code, 'SMALL','MEDIUM','LARGE')`. The VO is the single source of truth.
- Allocation query: `... WHERE serviceable AND no active package
  ORDER BY FIELD(size_code, …), code LIMIT 1 FOR UPDATE SKIP LOCKED` so concurrent agents pick
  different lockers without blocking; bounded retry on `ER_DUP_ENTRY`.

## Architecture

Dependencies point inward: HTTP → application → domain. Infrastructure depends on domain only.

```
src/
  shared/    clock, id, pickup-code, config, database (pool + migrator + tx helper),
             errors (DomainError + global exception filter), auth (jwt, guards, dev-token)
  lockers/   domain (Locker entity, LockerSize+rank, LockerStatus, LockerRepository port, errors)
             application (CreateLockerService, ListLockersService)
             infrastructure (MysqlLockerRepository)
             interface (LockersController, DTOs)            + lockers.module.ts
  customers/ domain + infrastructure only (find-or-create by contact; no controller)
  packages/  domain (Package entity, PickupCode VO, PackageRepository port,
                     StorageFeePolicy port, errors)
             application (StorePackageService, RetrievePackageService)
             infrastructure (MysqlPackageRepository, MysqlStorageRateRepository,
                             TieredStorageFeePolicy)
             interface (PackagesController, DTOs)            + packages.module.ts
```

Application services inject repository **interfaces** bound via tokens
(`{ provide: LOCKER_REPOSITORY, useClass: MysqlLockerRepository }`). Domain is `@nestjs/*`-free.

## Endpoints

| Method | Path | Role | Result |
|---|---|---|---|
| POST | `/auth/dev-token` | — (dev only) | `{ token }` for `{ role }` |
| POST | `/lockers` | Operator | create locker `{ code, size, stationId? }` |
| GET | `/lockers` | Operator | list: code, size, service status, `FREE`/`OCCUPIED`, active package summary |
| POST | `/packages` | Agent | store `{ size, customer{name,email?,phone?}, trackingRef? }` → `{ packageId, lockerId, lockerCode, pickupCode }`; 409 `No suitable locker available` |
| POST | `/packages/retrieve` | Customer | `{ lockerId, pickupCode }` → `{ packageId, retrievedAt, storageFee{amountMinor,currency} }`; 404/409 on invalid / already retrieved |
| GET | `/health` | — | liveness + DB check |

Retrieval is authorized by possession (locker id + pickup code); the Customer role only gates the route.

## Fee calculation (Level 3)

`day = 24h from stored_at`. Chargeable days = `ceil((retrievedAt - storedAt) / 24h)`. For each day
index `d`, pick the `storage_rate` band with `from_day <= d < to_day` (or `to_day IS NULL`), sum
`rate_minor`. Snapshot into `package.storage_fee_minor` at retrieval so later rate edits never
rewrite a past charge.

## Levels mapping

- **L1** — create lockers, list with status, store package (smallest-fit allocation, pickup code,
  locker id returned), "no locker available" message.
- **L2** — retrieve by locker id + pickup code; locker "opens" (returned in response); package
  marked retrieved; locker free again; invalid scenarios handled.
- **L3** — `stored_at` recorded; tiered fee computed at retrieval and returned with the
  confirmation; snapshotted.
- **L4** — concurrency: generated-column unique index + `FOR UPDATE SKIP LOCKED` + bounded retry;
  covered by a concurrency e2e test.

## Task breakdown

1. **Infra & tooling** — add deps (`mysql2`, `@nestjs/jwt`, `@nestjs/config`); typed config;
   `Dockerfile` (multi-stage) + `docker-compose.yml` (mysql 8.4 + api) + `.dockerignore` +
   `.env.example`; remove starter hello-world; `GET /health`.
2. **Schema + migrator** — `migrations/001_init.sql` (MySQL); runner + `db:migrate`; boot-time
   apply; seed sizes / rates / default station.
3. **Shared kernel** — `Clock`, `IdGenerator`, `PickupCodeGenerator` + hasher; `DomainError` +
   global exception filter.
4. **Auth** — JwtModule; `JwtAuthGuard`, `RolesGuard`, `@Roles`/`@CurrentUser`;
   `POST /auth/dev-token`; boot token print; `npm run token`.
5. **Lockers context** — domain + MySQL repo + `CreateLockerService` / `ListLockersService` +
   controller + unit tests.
6. **Store package (L1 + L4)** — customer find-or-create; `Package` domain + repo
   (generated-column unique, `SKIP LOCKED`, dup-entry mapping); `StorePackageService`
   (smallest-fit + bounded retry); `POST /packages`; unit + concurrency tests.
7. **Retrieve package (L2 + L3)** — `StorageFeePolicy` + `TieredStorageFeePolicy` + rate repo;
   `RetrievePackageService` (validate → fee → snapshot → mark retrieved → free locker);
   `POST /packages/retrieve`; unit tests (band boundaries, first-day-free, open-ended, errors).
8. **E2E + docs** — happy-path e2e (token → create → store → retrieve w/ fee → retrieve again
   409); concurrency e2e (N stores vs M lockers → exactly M succeed, no locker reused); rewrite
   `README.md` (compose up, tokens, curl walkthrough); lint / format / build green.

New deps: `mysql2`, `@nestjs/jwt`, `@nestjs/config`. Nothing else.
