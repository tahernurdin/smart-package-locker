# Smart Package Locker Management System

A REST service where delivery **agents** store packages in size-appropriate lockers and
**customers** retrieve them with a pickup code. **Operators** manage the stations, the lockers and
the prices.

Built with NestJS + MySQL in a layered/clean architecture. See
[`docs/implementation-plan.md`](docs/implementation-plan.md) for the design and
[`CLAUDE.md`](CLAUDE.md) for the engineering conventions. Work is tracked as task specs under
[`tasks/`](tasks/); [`api.http`](api.http) is a ready-to-run request collection for the whole API.

## Status

| Level | Scope | State |
|---|---|---|
| 1 | Create lockers, list with availability, store a package (smallest fit + pickup code) | ✅ Done |
| 2 | Customer retrieval (locker id + pickup code), locker freed on pickup | ✅ Done |
| 3 | Tiered extended-storage fees, charged and snapshotted on retrieval | ✅ Done |
| 4 | Concurrency hardening (`FOR UPDATE … SKIP LOCKED` + bounded retry) | ✅ Done |

Beyond the brief, and done: station and locker CRUD, operator-published storage-rate versions, and
paged/filtered/sorted listings for lockers and packages.

## Assumptions

- **Customer identity is owned by an upstream customer service.** A package is registered against a
  `customerId` this service is given; it stores that reference and never resolves it. Creating,
  updating and notifying customers — including delivering the pickup code by SMS/email — are out of
  scope per the brief, so there is no `customer` table and no `/customers` endpoint.
- **A pickup code is only good in the hands of the customer it was issued to.** Retrieval needs the
  locker id and the code *and* a token whose subject is the `customerId` the parcel was registered
  for — a leaked code collects nothing on its own. Ownership is never a field on the request, so
  there is no shape in which a caller names someone else; it comes from the token, as it does for
  `GET /packages/mine`.
- **Stations are this service's data**, unlike customers: `locker.station_id` references them,
  `GET /lockers` joins them, and `POST /lockers` requires one. So operators manage them directly
  (`/stations`).
- **There is no default station.** `stationId` is required on `POST /lockers` and on
  `POST /packages/:id/store` — a locker is always created *at* a named station, and an agent is
  always standing at one when they drop a parcel. Allocation never crosses stations. Both endpoints
  validate it (`404 station_not_found` / `409 station_decommissioned`), so an unknown station is
  never mistaken for "no locker fits". The migration seeds one station so a fresh deployment has
  somewhere to start, but nothing falls back to it.
- **Nothing is ever hard-deleted.** `DELETE` on a station or a locker *decommissions* it: the row
  stays (the assignment history that backs the fee calculation references it), it drops out of the
  default listing, and the allocator stops considering it. Decommissioning is terminal.

## Quickstart (Docker)

```bash
docker compose up --build
```

Brings up MySQL 8.4 and the API on `http://localhost:3000`. Schema migrations run automatically on
boot. With `AUTH_DEV_TOKENS=true` (the default in the compose file), one JWT per role is printed in
the API logs on startup.

Health checks — liveness never touches MySQL, readiness answers `503` when it can't:

```bash
curl localhost:3000/health/live     # {"status":"ok"}
curl localhost:3000/health/ready    # {"status":"ok","db":"up"}  (503 {"status":"error","db":"down"})
```

## Getting a token

Every route but `/health` and `/auth/dev-token` needs `Authorization: Bearer <token>` for the right
role (`OPERATOR`, `AGENT`, `CUSTOMER`). In dev, mint one:

```bash
curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
  -d '{"role":"OPERATOR"}'
# {"token":"eyJ…","role":"OPERATOR"}
```

or read them from the startup logs, or run `npm run token -- --role AGENT`.

`sub` is optional and defaults to `<role>-dev`. A customer's token must carry **their customer id**
as its subject: it is what `GET /packages/mine` filters on and what `POST /packages/retrieve` checks
the parcel against. A bare `token('CUSTOMER')` retrieves nothing.

```bash
curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
  -d '{"role":"CUSTOMER","sub":"11111111-1111-4111-8111-111111111111"}'
```

## Walkthrough

```bash
OP=$(curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
      -d '{"role":"OPERATOR"}' | jq -r .token)
AGENT=$(curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
      -d '{"role":"AGENT"}' | jq -r .token)

# Operator: create a station (or reuse a seeded one: curl -s .../stations ... | jq -r '.[0].id')
STATION=$(curl -sXPOST localhost:3000/stations -H "authorization: Bearer $OP" \
  -H 'content-type: application/json' \
  -d '{"name":"North Depot","location":"Level 2"}' | jq -r .id)

# Operator: create lockers of each size at that station — stationId is required
for s in SMALL MEDIUM LARGE; do
  curl -sXPOST localhost:3000/lockers -H "authorization: Bearer $OP" \
    -H 'content-type: application/json' \
    -d "{\"code\":\"A-$s\",\"size\":\"$s\",\"stationId\":\"$STATION\"}"
done

# Operator: list lockers with availability + station — a page of {items,total,limit,offset}
curl -s "localhost:3000/lockers?stationId=$STATION&availability=FREE" -H "authorization: Bearer $OP"

# Agent: register the parcel against a customerId (issued by the upstream customer service)
CUSTOMER_ID=11111111-1111-4111-8111-111111111111
PKG=$(curl -sXPOST localhost:3000/packages -H "authorization: Bearer $AGENT" \
  -H 'content-type: application/json' \
  -d "{\"size\":\"SMALL\",\"customerId\":\"$CUSTOMER_ID\"}" | jq -r .packageId)

# Agent: drop it in a locker at the station they're standing at — smallest fit wins
STORED=$(curl -sXPOST "localhost:3000/packages/$PKG/store" -H "authorization: Bearer $AGENT" \
  -H 'content-type: application/json' -d "{\"stationId\":\"$STATION\"}")
echo "$STORED"
# {"packageId":"…","lockerId":"…","lockerCode":"A-SMALL","pickupCode":"482913","status":"STORED"}

# Customer: see their own parcels (identity comes from the token subject)
CUSTOMER=$(curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
      -d "{\"role\":\"CUSTOMER\",\"sub\":\"$CUSTOMER_ID\"}" | jq -r .token)
curl -s 'localhost:3000/packages/mine?status=STORED' -H "authorization: Bearer $CUSTOMER"

# Customer: retrieve it with the locker id + pickup code
curl -sXPOST localhost:3000/packages/retrieve -H "authorization: Bearer $CUSTOMER" \
  -H 'content-type: application/json' \
  -d "{\"lockerId\":$(jq .lockerId <<<"$STORED"),\"pickupCode\":$(jq .pickupCode <<<"$STORED")}"
# {"packageId":"…","lockerCode":"A-SMALL","retrievedAt":"…",
#  "storageFee":{"amountMinor":0,"currency":"AUD"},"opened":true}
# amountMinor is 0 here (picked up same day); see "Storage fees" below for the tiers.
# — the locker is now FREE again.
```

If no serviceable locker fits, the store call returns `409 no_suitable_locker`. A retrieval answers
`404 retrieval_failed` when the locker is unknown, holds nothing, holds someone else's parcel, or
the code is wrong — one answer for all four, so the endpoint is never an oracle for the parcels it
protects.

## Endpoints

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/health/live` | — | Liveness — process only, no DB |
| `GET` | `/health/ready` | — | Readiness — `SELECT 1`, `503` when the DB is down |
| `POST` | `/auth/dev-token` | — (dev only) | Mint a token for `{ role, sub? }` |
| `POST` | `/stations` | Operator | Create a station `{ name, location? }` |
| `GET` | `/stations` | Operator | List stations; `?includeDecommissioned=true` to see retired ones |
| `GET` | `/stations/:id` | Operator | Read one station (retired ones included) |
| `PATCH` | `/stations/:id` | Operator | Rename / relocate `{ name?, location? }` |
| `DELETE` | `/stations/:id` | Operator | Decommission — `409` while it still has live lockers |
| `POST` | `/lockers` | Operator | Create a locker `{ code, size, stationId }` |
| `GET` | `/lockers` | Operator | Paged locker listing — filters and sorts below |
| `GET` | `/lockers/:id` | Operator | Read one locker with its occupancy and station |
| `PATCH` | `/lockers/:id` | Operator | Relabel / take out of service `{ code?, status? }` |
| `DELETE` | `/lockers/:id` | Operator | Decommission — `409` while a package is inside |
| `POST` | `/storage-rates` | Operator | Publish a rate version `{ sizeCode, effectiveFrom, bands[] }` |
| `GET` | `/storage-rates` | Operator | List published versions, newest first; `?sizeCode=` |
| `POST` | `/packages` | Agent | Register a parcel `{ size, customerId, trackingRef? }` → `{ packageId, status }` |
| `POST` | `/packages/:id/store` | Agent | Drop it at a station `{ stationId }` → the smallest fitting locker there → `{ lockerId, lockerCode, pickupCode, status }` |
| `POST` | `/packages/retrieve` | Customer | Retrieve `{ lockerId, pickupCode }` — the caller must own the parcel; opens the locker, returns the fee |
| `GET` | `/packages/mine` | Customer | The caller's own parcels, paged |
| `GET` | `/packages` | Operator | Search every customer's parcels, paged |

Each `GET /lockers` item:

```json
{ "id": "…", "code": "A-01", "size": "SMALL", "status": "IN_SERVICE",
  "availability": "FREE", "activePackageId": null,
  "stationId": "…", "stationName": "Default Station", "location": "HQ" }
```

Each package item (both listings share the shape, and neither ever carries the pickup code):

```json
{ "id": "…", "customerId": "…", "size": "SMALL", "trackingRef": null, "status": "RETRIEVED",
  "registeredAt": "…", "storedAt": "…", "retrievedAt": "…",
  "storageFee": { "amountMinor": 1400, "currency": "AUD" },
  "lockerId": "…", "lockerCode": "A-01", "stationId": "…", "stationName": "North Depot" }
```

## Listings: paging, filtering, sorting

`GET /lockers`, `GET /packages` and `GET /packages/mine` answer the same envelope —
`{ items, total, limit, offset }`, where `total` counts everything matching the filter, not the page
— and take the same window: `?limit=` (default 50, max 200) and `?offset=`. The service resolves and
clamps both, so a caller that skips the HTTP pipe gets the same defaults and the same ceiling.

| Listing | Filters | `sortBy` (with `sortDir=asc\|desc`) |
|---|---|---|
| `GET /lockers` | `stationId`, `size`, `status`, `availability`, `includeDecommissioned` | `code` (default, asc), `station`, `createdAt` |
| `GET /packages` | `customerId`, `status`, `size`, `stationId`, `lockerId`, `trackingRef` | `registeredAt` (default, desc), `storedAt`, `retrievedAt`, `station` |
| `GET /packages/mine` | `status`, `size` | same as above |

Two deliberate shapes here:

- **The customer listing has no `customerId`.** Whose parcels these are comes from the bearer token
  alone, and `forbidNonWhitelisted` turns a request that supplies one into a `400` rather than
  quietly ignoring it. That is why it is a separate route from the operator's search rather than a
  filter the customer could point elsewhere.
- **Low-cardinality fields are filters, never sorts.** `size`, `status` and `availability` have two
  or three values each; ordering by one is really a grouping, and paging through it is useless.
  Sorting is offered only on fields that discriminate. An unknown `sortBy`/`sortDir` is a `400`
  (`invalid_locker_sort` / `invalid_package_sort`) listing what is allowed — the set is closed, so
  nothing off the wire ever reaches an `ORDER BY`.

Sorts are backed by indexes added in `migrations/004_listing_sort_indexes.sql`, each ending in the
same tiebreakers the adapter appends (`code`, then `id`) so the index covers the *whole* ordering
and MySQL can skip the sort. The two sorts that order by a joined table (`station`, and the package
listing's `storedAt`/`retrievedAt`) stay filesorts by construction and are bounded by the filters
applied alongside them.

## Package lifecycle

`REGISTERED → STORED → RETRIEVED`, split across two tables:

- **`package`** — the parcel: `customer_id`, size, tracking ref, status. Created by `POST /packages`,
  the seam an order or carrier feed would call.
- **`locker_assignment`** — one storage episode: locker, `stored_at`, pickup-code hash,
  `retrieved_at`, the fee snapshot. Written by the agent's drop (`POST /packages/:id/store`) and
  closed on retrieval.

Storing a package twice is `409 package_already_stored`, enforced by `uq_one_assignment_per_package`
rather than by a read-then-write check. Retrieval closes the assignment with a conditional
`UPDATE … WHERE retrieved_at IS NULL`; zero affected rows is `409` and the locker frees.

## Concurrency (Level 4)

Two agents can reach for the same locker at the same instant. Three layers handle it, in order of
who is allowed to be wrong:

1. **The database is the correctness backstop.** `locker_assignment.active_locker_id` is a generated
   column (the locker id while `retrieved_at IS NULL`, `NULL` after), and
   `uq_one_active_assignment_per_locker` is unique over it. A locker cannot hold two active packages
   even if every layer above it misbehaves — a race surfaces as `ER_DUP_ENTRY`, never as a
   double-book.
2. **`FOR UPDATE … SKIP LOCKED` is the fairness layer.** Allocation selects the smallest free fitting
   locker inside the transaction that inserts the assignment; concurrent agents skip each other's
   locked rows and fan out to *different* lockers instead of queueing on one.
3. **A bounded retry (3 attempts) covers a lost race.** A duplicate on the locker key becomes
   `LockerJustTakenError` and the store is retried; a duplicate on the *package* key is terminal and
   becomes `409 package_already_stored`. The adapter dispatches on the constraint name, never on
   `ER_DUP_ENTRY` alone — reading a package clash as a locker race would burn all three attempts on
   a race that never happened.

Allocation is a single indexed walk: `size_rank` is a generated column carrying `LockerSize.rank`,
and `ix_locker_allocation (station_id, status, size_rank, code)` serves the filter, the "fits" range
and the smallest-first order together, so `LIMIT 1` stops at the first match instead of sorting the
bank (`migrations/005_locker_size_rank.sql`).

Retrieval concurrency was handled in Level 2 by the conditional update described above.

Covered by: the retry specs in `store-package.service.spec.ts` (a lost race retried and won, and
given up on after three); 8 concurrent stores against a single locker → exactly one `200` and one
assignment row (`level1.e2e-spec.ts`); 6 concurrent retrievals of one package → exactly one `200`
(`level2.e2e-spec.ts`).

One property is deliberately left untested end to end: fan-out under `M` lockers and `N > M`
concurrent stores — that exactly `M` succeed, on `M` **distinct** lockers, with no spurious
`no_suitable_locker` from an agent queueing behind a peer. Layer 1 makes a double-book
unrepresentable whatever the lock does, so what is unproven is throughput under contention, not
correctness. [Task 20](tasks/task-20-lifecycle-and-contention-e2e.md) records the suite that would
assert it.

## Managing lockers and stations

Operators get full CRUD on both. Two rules shape it:

- **A locker needs a live station.** `POST /lockers` validates `stationId` — `404 station_not_found`
  for an unknown one, `409 station_decommissioned` for a retired one. (Before this existed, an
  unknown id reached the foreign key and came back as a 500.)
- **`DELETE` decommissions, it never erases.** `locker_assignment` rows reference their locker, and
  lockers reference their station, so the history has to keep its referent. A retired row is hidden
  from the default list, still readable by id, visible under `?includeDecommissioned=true`, and
  frozen — no further edits, no second retirement.

Retirement is guarded on both sides: a locker holding a package answers `409 locker_occupied`, and a
station with lockers still standing answers `409 station_not_empty`. Retire the lockers, then the
station.

A locker's `code` and `status` are editable; its `size` and `stationId` are not — those describe the
hardware and where it is bolted, and a box that changed size would invalidate the allocation already
made for whatever is inside it. Retire it and create its replacement. `PATCH` moves a locker between
`IN_SERVICE` and `OUT_OF_SERVICE` (maintenance — the allocator only ever picks `IN_SERVICE`);
`DECOMMISSIONED` is reachable only through `DELETE`, which checks the locker is empty first.

## Storage fees

A package is charged per **day** it occupies a locker, where a day is a 24h window from `stored_at`
and every day *started* is billed (`ceil`). So retrieving within 24h is one day; at 24h + 1ms it's
two.

The rate is tiered per size (`storage_rate` table, half-open `[from_day, to_day)` bands). The seed:

| size | day 0 | days 1–2 | days 3–5 | day 6+ |
|---|---|---|---|---|
| SMALL | free | 600 | 800 | 1000 |
| MEDIUM | free | 900 | 1200 | 1500 |
| LARGE | free | 1400 | 1800 | 2200 |

(minor units — cents — in the configured `CURRENCY`). Example: a SMALL package out for 7 days costs
`0 + 600·2 + 800·3 + 1000 = 4600`.

The fee is computed at retrieval, returned in the pickup confirmation
(`storageFee: { amountMinor, currency }`), and **snapshotted** onto the assignment — a later rate
change never rewrites a past charge. The rate *version* applied is the one in effect when the
package was stored (`effective_from <= stored_at`).

### Rate versions are published, not edited

`/storage-rates` is publish-and-read only: no `PATCH`, no `DELETE`. Because a fee is derived from
the version effective at `stored_at`, editing a published version would rewrite what a customer was
already charged. Change a price by publishing a new version:

```bash
curl -sXPOST localhost:3000/storage-rates -H "authorization: Bearer $OP" \
  -H 'content-type: application/json' -d '{
    "sizeCode": "SMALL",
    "effectiveFrom": "2027-01-01T00:00:00.000Z",
    "bands": [{"fromDay":0,"toDay":1,"rateMinor":0},
              {"fromDay":1,"toDay":3,"rateMinor":700},
              {"fromDay":3,"rateMinor":1200}]
  }'
```

A version is validated as a whole: bands must tile `[0, ∞)` — start at day 0, meet at the edges, and
end with exactly one open-ended tail — `effectiveFrom` must be in the future (rates are
forward-only), and one size cannot have two versions starting at the same instant. Band ids stay
internal: a version is immutable, so there is nothing to address one of them for.

## Local development (without Docker)

```bash
cp .env.example .env          # point DATABASE_URL at your MySQL 8
npm install
npm run db:migrate            # apply migrations/*.sql
npm run start:dev
```

| Task | Command |
|---|---|
| Lint | `npm run lint` (oxlint) |
| Format | `npm run format` (Prettier) |
| Build | `npm run build` → `dist/`, then `npm run start:prod` |
| Mint a token | `npm run token -- --role AGENT` |

## Tests

```bash
npm run test                  # unit tests (no DB)
npm run lint
docker compose up -d mysql    # e2e needs a MySQL
npm run test:e2e              # every test/*.e2e-spec.ts
```

Unit specs are `*.spec.ts` beside the code, driving domain objects and application services against
in-memory fakes. E2E specs are `test/*.e2e-spec.ts`, running controller-to-DB against a real MySQL
with no mocks: the Level 1–3 flows (L3 fakes the clock to age a package), station and locker
management including the paged listing, storage-rate publishing and the seeded schedules, both
package listings, and the health probes. Suites run serially and clear their tables between tests,
keeping the rows seeded by `migrations/002_seed.sql`.

They run against **their own database** (`locker_test`, set by the checked-in `.env.test`), never
the one you develop against. `test/global-setup.ts` creates it on first run; each suite applies the
migrations. To point e2e elsewhere, set `DATABASE_URL` in the shell — it wins over both env files.

Run one test file or case:

```bash
npx vitest run src/packages/application/store-package.service.spec.ts
npx vitest run -t "assigns the smallest locker that fits"
```

## Layout

```
src/
  shared/         config, database (pool + migrator + transaction), clock, id,
                  pickup-code, pagination, errors, auth
  dev-token/      POST /auth/dev-token + the CLI behind `npm run token`
  health/         liveness + readiness probes
  stations/       domain / application / infrastructure / interface  (+ module)
  lockers/        domain / application / infrastructure / interface  (+ module)
  packages/       domain / application / infrastructure / interface  (+ module)
  storage-rates/  domain / application / infrastructure / interface  (+ module)
migrations/       001 schema · 002 seed · 003 rate versions · 004 listing indexes
                  · 005 locker size rank — applied in order, tracked in schema_migrations
test/             *.e2e-spec.ts against a real MySQL
tasks/            per-task specs (L1: 01–08, L2: 09–12, L3: 15–17, split + L4: 18–21,
                  CRUD: 22–24)
docs/             implementation plan
api.http          the whole API as runnable requests
```

Dependencies point inward: HTTP → application → domain; infrastructure implements domain ports and
is bound to them in each feature module. One deliberate exception: application services take the
request DTO as their input type (`import type`, so nothing survives compilation) rather than
restating every request shape as a second, identical interface — see [`CLAUDE.md`](CLAUDE.md).
