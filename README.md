# Smart Package Locker Management System

A REST service where delivery **agents** store packages in size-appropriate lockers and
**customers** retrieve them with a pickup code. **Operators** manage the stations, the lockers and
the prices.

Built with NestJS + MySQL. [Architecture](#architecture) covers how it is put together and
[Design decisions](#design-decisions) why, [`api.http`](api.http) is a ready-to-run request
collection for the whole API, and [`CLAUDE.md`](CLAUDE.md) is the same conventions written as rules
for contributors and coding agents.

## Status

| Level | Scope | State |
|---|---|---|
| 1 | Create lockers, list with availability, store a package (smallest fit + pickup code) | ✅ Done |
| 2 | Retrieval at the station (locker id + pickup code), locker freed on pickup | ✅ Done |
| 3 | Tiered extended-storage fees, charged and snapshotted on retrieval | ✅ Done |
| 4 | Concurrency hardening (`FOR UPDATE … SKIP LOCKED` + bounded retry) | ✅ Done |

Beyond the brief, and done: station and locker CRUD, operator-published storage-rate versions,
paged/filtered/sorted listings for lockers and packages, and a re-issue endpoint for a customer who
lost their pickup code.

## Assumptions

- **Customer identity is owned by an upstream customer service.** A package is registered against a
  `customerId` this service is given; it stores that reference and never resolves it. Creating,
  updating and notifying customers — including delivering the pickup code by SMS/email — are out of
  scope per the brief, so there is no `customer` table and no `/customers` endpoint.
- **The pickup code is the credential, because nobody is logged in at a locker.** The brief's
  retrieval is a person at a cabinet: *"the customer provides the locker ID and pickup code"*. So
  `POST /packages/retrieve` is called by the **station**, not by the customer — the token proves
  which locker bank is asking, and the code alone proves the parcel is the caller's. That is why
  the code is generated per assignment, stored only as a keyed hash (HMAC-SHA256 under a secret
  pepper, salted with the assignment id), compared in constant time, and capped at five wrong
  guesses per door. The customer's own token is for the app
  (`GET /packages/mine`), which shows them where to walk and opens nothing. The cost of counting per
  door rather than per caller is accepted deliberately: someone at a keypad can freeze one locker
  for fifteen minutes. Counting per caller is not available — there is no caller identity — and the
  attacker has to be standing at the cabinet to do it.
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
role (`OPERATOR`, `AGENT`, `CUSTOMER`, `STATION`). In dev, mint one:

```bash
curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
  -d '{"role":"OPERATOR"}'
# {"token":"eyJ…","role":"OPERATOR"}
```

or read them from the startup logs, or run `npm run token -- --role AGENT`.

`sub` is optional and defaults to `<role>-dev`. A customer's token must carry **their customer id**
as its subject — it is what `GET /packages/mine` filters on, so a bare `token('CUSTOMER')` lists
nothing. A `STATION` token needs no subject: it says a locker bank is calling, never who is at it.

```bash
curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
  -d '{"role":"CUSTOMER","sub":"11111111-1111-4111-8111-111111111111"}'
```

## Walkthrough

The whole story in one shell script — station, locker, drop, find, lost code, collect. Needs the API
from [Quickstart](#quickstart-docker) and `jq`. For the exhaustive version, including every error
path, use [`api.http`](api.http) instead: same flow, plus the negatives, as clickable requests.

```bash
mint() { curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
           -d "$1" | jq -r .token; }

OP_TOKEN=$(mint '{"role":"OPERATOR"}')
AGENT_TOKEN=$(mint '{"role":"AGENT"}')

# Operator: create a station (or reuse the seeded one: curl -s .../stations … | jq -r '.[0].id')
STATION_ID=$(curl -sXPOST localhost:3000/stations -H "authorization: Bearer $OP_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"North Depot","location":"Level 2"}' | jq -r .id)

# Operator: create lockers of each size at that station — stationId is required
for s in SMALL MEDIUM LARGE; do
  curl -sXPOST localhost:3000/lockers -H "authorization: Bearer $OP_TOKEN" \
    -H 'content-type: application/json' \
    -d "{\"code\":\"A-$s\",\"size\":\"$s\",\"stationId\":\"$STATION_ID\"}"
done

# Operator: list lockers with availability + station — a page of {items,total,limit,offset}
curl -s "localhost:3000/lockers?stationId=$STATION_ID&availability=FREE" \
  -H "authorization: Bearer $OP_TOKEN"

# Agent: register the parcel against a customerId (issued by the upstream customer service)
CUSTOMER_ID=11111111-1111-4111-8111-111111111111
PACKAGE_ID=$(curl -sXPOST localhost:3000/packages -H "authorization: Bearer $AGENT_TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"size\":\"SMALL\",\"customerId\":\"$CUSTOMER_ID\"}" | jq -r .packageId)

# Agent: drop it in a locker at the station they're standing at — smallest fit wins
STORED=$(curl -sXPOST "localhost:3000/packages/$PACKAGE_ID/store" \
  -H "authorization: Bearer $AGENT_TOKEN" \
  -H 'content-type: application/json' -d "{\"stationId\":\"$STATION_ID\"}")
echo "$STORED"
# {"packageId":"…","lockerId":"…","lockerCode":"A-SMALL","pickupCode":"312751","status":"STORED"}
LOCKER_ID=$(jq -r .lockerId <<<"$STORED")
PICKUP_CODE=$(jq -r .pickupCode <<<"$STORED")

# Customer: find it in the app — which station, which door. Identity comes from the
# token subject, so this lists their parcels and nobody else's
CUSTOMER_TOKEN=$(mint "{\"role\":\"CUSTOMER\",\"sub\":\"$CUSTOMER_ID\"}")
curl -s 'localhost:3000/packages/mine?status=STORED' -H "authorization: Bearer $CUSTOMER_TOKEN"

# Customer: lost the code? Ask the app for a new one — the old one dies here
PICKUP_CODE=$(curl -sXPOST "localhost:3000/packages/$PACKAGE_ID/pickup-code" \
  -H "authorization: Bearer $CUSTOMER_TOKEN" | jq -r .pickupCode)

# Station: the customer keys that code into the cabinet, which calls this with its
# own token — nobody is logged in at a keypad, so the code is the credential
STATION_TOKEN=$(mint '{"role":"STATION"}')
curl -sXPOST localhost:3000/packages/retrieve -H "authorization: Bearer $STATION_TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"lockerId\":\"$LOCKER_ID\",\"pickupCode\":\"$PICKUP_CODE\"}"
# {"packageId":"…","lockerCode":"A-SMALL","retrievedAt":"…",
#  "storageFee":{"amountMinor":0,"currency":"AUD"},"opened":true}
# amountMinor is 0 here (picked up same day); see "Storage fees" below for the tiers.
# — the locker is now FREE again.
```

If no serviceable locker fits, the store call returns `409 no_suitable_locker`. A retrieval answers
`404 retrieval_failed` when the locker is unknown, holds nothing, or the code is wrong — one answer
for all three, so the endpoint is never an oracle for the parcels it protects.

## The customer journey

What the walkthrough does with `curl`, a customer does across a phone app and a cabinet. Setting it
out step by step is what makes the split visible: the app is a *view* of parcels, authenticated as
the customer, and the cabinet is a *door*, authenticated as the station and unlocked by the code
alone.

1. **The parcel arrives.** The agent's drop (`POST /packages/:id/store`) returns the pickup code in
   plaintext, once, and it is never readable again — only a keyed hash is stored. Getting it to
   the customer is out of band (SMS, push, email) — the point where that send belongs is marked
   `TODO(notify)` in `StorePackageService`, at the one moment the code exists in plaintext.
2. **The customer opens the app.** `GET /packages/mine?status=STORED`, with their own token. Whose
   parcels these are comes from the token subject: `ListMyPackagesQueryDto` has no `customerId`
   field at all, and `forbidNonWhitelisted` turns a request that supplies one into a `400` rather
   than ignoring it. So there is no shape of request in which a customer enumerates someone else's
   parcels.
3. **They tap a parcel.** The row already carries everything the screen needs — `stationName` for
   the site, `lockerCode` for the door to walk to, `lockerId` for the call to come, plus `size` and
   `storedAt`. It never carries the pickup code.
4. **They walk to the cabinet and key the code in.** The keypad calls
   `POST /packages/retrieve` with `{ lockerId, pickupCode }` under the **station's** token — the
   person standing there has no session, which is the whole reason a pickup code exists. The code is
   therefore the only credential: matched against a per-assignment keyed hash in constant time,
   with an unknown locker, an empty one and a wrong code all answering the same
   `404 retrieval_failed`. Five wrong codes at one door close it to everyone for fifteen minutes. On
   success the fee is settled, the locker frees, and the response reports `opened: true`.

5. **If they no longer have the code** — the SMS is gone, or someone has been guessing at their door
   and frozen it — the app asks for a new one: `POST /packages/:id/pickup-code`, authenticated as the
   customer. It answers with a fresh code, voids the old one, and lifts that locker's failed-attempt
   block, since those guesses were against a code that no longer exists. Three codes per parcel per
   hour (`PICKUP_CODE_REISSUE_MAX`).

   That cap is on **cost, not on guessing** — whoever can call this is handed the new code in the
   response, so there was never anything to guess. What a re-issue does spend is a message to the
   customer, so the budget counts codes issued and nothing ever gives it back: three on one parcel
   and that parcel waits out the window. Both places a code enters the world carry a `TODO(notify)`
   for that send — `StorePackageService` and `ReissuePickupCodeService`.

   Two counters meet on this endpoint and they are not the same one. The re-issue budget only ever
   grows; the *door's* wrong-code block is the one that gets cleared, and clearing it refunds
   nothing.

The customer's token and the pickup code do different jobs, and neither substitutes for the other:
the token decides **which parcels you may look at**, the code decides **which door may open**. The
app can tell you where your parcel is and cannot open it; the keypad can open a door and has no idea
who you are. Re-issuing is the single point where the two meet, and it is the identity that does the
work there — the caller is asking *for* the credential, so it can only ever be answered for a parcel
the token's own subject owns.

**One gap this leaves, and one consequence worth stating.**

`opened: true` is a hardcoded literal. Nothing in this service talks to a latch — there is no
hardware to talk to — so the point where it would is marked with a `TODO(hardware)` in
`RetrievePackageService`, after the write that settles the concurrency race, so that only the one
request that actually claimed the parcel could ever command a door. Closing that TODO means a
`LockerDoor` port in `lockers/domain/` with an adapter behind it, and a reconciliation path for the
case the door refuses after the parcel is already recorded as collected.

The consequence: because only the hash is stored, a lost code can never be re-read —
`POST /packages/:id/pickup-code` mints a *new* one rather than recovering the old. That is the right
behaviour (a recoverable code would mean a reversible hash), but it means every re-issue invalidates
whatever the customer might still find in an old SMS.

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
| `POST` | `/packages/:id/pickup-code` | Customer | Re-issue the pickup code for the caller's own stored parcel — returns the new code once, and voids the old one |
| `POST` | `/packages/retrieve` | Station | Retrieve `{ lockerId, pickupCode }` from the cabinet's keypad — the code is the credential; opens the locker, returns the fee |
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

Retrieval concurrency was handled in Level 2 by the conditional update described above, and
re-issuing a pickup code writes through the same guard — whichever of the two lands first wins, so a
new code can never be minted into a locker that was just emptied.

Covered by: the retry specs in `store-package.service.spec.ts` (a lost race retried and won, and
given up on after three); 8 concurrent stores against a single locker → exactly one `200` and one
assignment row (`level1.e2e-spec.ts`); 6 concurrent retrievals of one package → exactly one `200`
(`level2.e2e-spec.ts`).

One property is deliberately left untested end to end: fan-out under `M` lockers and `N > M`
concurrent stores — that exactly `M` succeed, on `M` **distinct** lockers, with no spurious
`no_suitable_locker` from an agent queueing behind a peer. Layer 1 makes a double-book
unrepresentable whatever the lock does, so what is unproven there is throughput under contention,
not correctness.

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

Two suites, run by Vitest (not Jest), with different requirements: the unit suite needs nothing
running, the e2e suite needs MySQL and Redis.

```bash
npm run test                       # unit — 41 specs, no DB, no Redis, no Docker
npm run test:watch                 # the same, re-running on change
npm run test:cov                   # the same, with a coverage report
npm run lint                       # oxlint

docker compose up -d mysql redis   # e2e needs both
npm run test:e2e                   # every test/*.e2e-spec.ts
```

**Unit specs** are `*.spec.ts` beside the code they cover, and they touch no I/O at all: repositories
are in-memory fakes, the clock and the id/pickup-code generators are stubs, so a fee for a seven-day
stay is asserted by handing the service a date rather than by waiting. They cover the domain objects
that enforce their own invariants (`LockerSize`, `PickupCode`, `Package`, `LockerAssignment`,
`Locker`, `LockerStation`, the storage-rate schedule and the fee calculator), every application
service with its success path and each domain error it can raise, and the shared edges that
everything else trusts — the exception filter's error-to-status mapping, the auth guards, pagination
and config loading. That is the suite to run while writing code; it finishes in about two seconds.

**E2E specs** are `test/*.e2e-spec.ts`, and they use **external servers, not test doubles**: a real
MySQL 8.4 and a real Redis over TCP, with the app booted through `AppModule` and its real DI graph.
Nothing is mocked or in-memory — no SQLite, no embedded server, no stubbed repository. A test asserts
that a `SELECT … FOR UPDATE SKIP LOCKED` really does fan two concurrent agents onto different
lockers, that a generated column really does reject a double-book, and that the limiter's Lua really
does reset a key's TTL in Redis. None of that is provable against a fake, which is the whole reason these suites
carry the cost of needing something running.

`docker compose up -d mysql redis` is the intended way to provide them (`mysql:8.4` on `3306`,
`redis:7-alpine` on `6379`); any MySQL 8 and Redis you already run will do. Nothing is silently
skipped when they are missing, but the two fail differently: without MySQL every suite fails at once
with `ECONNREFUSED` on `3306`, while without Redis only the limiter suite is affected and it does
not fail fast — its `beforeAll` sits on the connection until Vitest kills it with `Hook timed out in
30000ms`. A 30-second pause there means Redis, not a slow test.

They cover the Level 1–3 flows (L3 fakes the clock to age a package), station and locker management
including the paged listing, storage-rate publishing and the seeded schedules, both package
listings, the pickup-attempt limiter, and the health probes. Suites run serially — they share one
database — and clear their tables between tests, keeping the rows seeded by `migrations/002_seed.sql`.

Neither store is the one you develop against:

- **MySQL** — database `locker_test`, never `locker`. `test/global-setup.ts` creates it on first run
  (the compose service only creates `locker`), and each suite applies the migrations itself. This
  one *is* destructive: suites truncate their tables between tests, so pointing `DATABASE_URL` at a
  database you care about will empty it.
- **Redis** — DB `1`, never DB `0`. Not destructive: the limiter suite never flushes, and keys every
  test under a fresh random locker id, so it stays safe to run against a Redis someone else is
  using.

Both come from the checked-in `.env.test`, which holds no secrets and exists so a fresh clone can go
straight from `docker compose up` to `npm run test:e2e`. `test/env.ts` loads it before `.env` and
`process.loadEnvFile` keeps the first value it sees, so the precedence is: a real shell variable
(CI) beats `.env.test`, which beats `.env`. To point the suites at another server, export
`DATABASE_URL` or `REDIS_URL` in the shell.

Run one file or one case, in either suite:

```bash
npx vitest run src/packages/application/store-package.service.spec.ts
npx vitest run -t "assigns the smallest locker that fits"
npx vitest run --config ./vitest.config.e2e.ts test/level2.e2e-spec.ts
```

## Architecture

Layered, feature-sliced, with dependencies pointing **inward**: HTTP → application → domain.
Infrastructure depends on the domain and never the reverse, so the rules of the business sit in
plain TypeScript that imports nothing from Nest, MySQL or Redis.

```
src/
  shared/         config, database (pool + migrator + transaction), redis, clock,
                  id, pickup-code, pagination, errors, auth
  dev-token/      POST /auth/dev-token + the CLI behind `npm run token`
  health/         liveness + readiness probes
  stations/       domain / application / infrastructure / interface  (+ module)
  lockers/        domain / application / infrastructure / interface  (+ module)
  packages/       domain / application / infrastructure / interface  (+ module)
  storage-rates/  domain / application / infrastructure / interface  (+ module)
migrations/       001 schema · 002 seed · 003 rate versions · 004 listing indexes
                  · 005 locker size rank — applied in order, tracked in schema_migrations
test/             *.e2e-spec.ts against a real MySQL (and Redis, for the limiter)
api.http          the whole API as runnable requests
```

Each feature slice holds the same four layers:

- **`domain/`** — entities, value objects, domain errors, and the repository interfaces (ports) the
  application depends on. No `@Injectable()`, no `@nestjs/*`, no SQL. Entities enforce their own
  invariants and are immutable: `Package.retrieve()` throws `PackageAlreadyRetrievedError` rather
  than returning an object in a state that shouldn't exist, and every transition returns a new
  instance.
- **`application/`** — one use case per service method (`store`, `retrieve`, `reissue`), orchestrating
  domain objects and ports. No `Request`/`Response`, no SQL, no framework concerns.
- **`infrastructure/`** — the adapters: `mysql2` repositories, the Redis limiters, the fee policy.
- **`interface/`** — controllers and DTOs. Thin by construction: validate into a DTO, call one
  service method, return. `PackagesController.retrieve` is three lines and contains no `try/catch`,
  because a thrown domain error is the error path.

**Depend on abstractions.** Application services inject interfaces declared in `domain/`, bound to
implementations by token in the feature module — the only place a concrete class is named:

```ts
{ provide: LOCKER_REPOSITORY, useClass: MysqlLockerRepository },
{ provide: PICKUP_ATTEMPT_LIMITER, useClass: RedisPickupAttemptLimiter },
```

Moving the attempt counter off Redis, or the fee policy onto a different rate source, is a one-line
change in a module and a new file under `infrastructure/`. Nothing above it moves.

**The module graph is acyclic** — `packages → lockers → stations` — which is why `countLiveLockers`,
the guard on retiring a station, sits on `StationRepository` rather than `LockerRepository`: only
the MySQL adapter knows it reads the `locker` table, and the port stays a plain question about a
station.

**Determinism is a design constraint, not a testing trick.** Nothing in `domain/` or `application/`
calls `new Date()` or a raw RNG: the clock, id generation and pickup-code generation are ports, so
a seven-day storage fee is asserted by handing a service two dates instead of waiting a week, and a
generated code is fixed in a test without stubbing a module.

**Errors are typed and translated once.** Domain and application code throws `DomainError`
subclasses carrying a `kind` (`not_found`, `conflict`, `validation`, `forbidden`, `rate_limited`)
and a stable `code`; a single exception filter maps `kind` to a status at the HTTP edge. No service
constructs an `HttpException`, so the same service called from a queue consumer or a CLI would
behave identically.

**Validation happens twice, on purpose.** DTOs check shape and format at the controller boundary;
the domain re-checks the invariant regardless. `CreateLockerDto.size` is typed `LockerSizeCode`, and
`LockerSize.of(...)` still throws — because a DTO's type is a promise about one caller, not a
business guarantee.

**One deliberate exception to the layering:** an application service takes its feature's request DTO
as an input type (`import type`, so nothing survives compilation) rather than restating every
request shape as a second, identical interface. Types are erased, so no framework or HTTP code
actually reaches the application layer; the exception is types only, and `domain/` still imports
from nothing above it.

[`CLAUDE.md`](CLAUDE.md) restates these as working rules for anyone (or anything) adding code —
along with the environment's sharp edges: it is ESM, so every relative import carries a `.js`
extension; tests are Vitest, not Jest; the linter is oxlint, not ESLint.

## Design decisions

| Area | Choice | Why |
|---|---|---|
| DB access | `mysql2` pool + hand-written SQL, confined to `infrastructure/` | No ORM decorators in the domain; the adapter owns every query and the index it needs |
| Schema | Plain `.sql` migrations + a small runner (`npm run db:migrate`, also applied on API boot) | One path for local, Docker and e2e; each file documents the decision it encodes |
| IDs | App-generated UUID v4 stored as `CHAR(36)`, behind an `IdGenerator` port | Readable across tables, deterministic under test |
| Time | Every `DATETIME(6)` supplied by the app through a `Clock` port, never a DB default | Fees depend on elapsed time, so tests must be able to age a package |
| Pickup code | 6 digits, stored as HMAC-SHA256 keyed by `PICKUP_CODE_PEPPER` and salted with the assignment id, compared with `crypto.timingSafeEqual`, in plaintext only in the response that issues it | It is the only credential at a keypad, so the stored form must collect nothing if the table leaks. Six digits is a 10^6 keyspace, so the pepper (required in production, never stored in the DB) is what stops a leaked table being attacked at all, and the per-row salt is what stops one precomputed pass cracking the whole bank |
| Auth | `@nestjs/jwt` + `JwtAuthGuard` + `RolesGuard` + `@Roles()`; `POST /auth/dev-token` is env-gated | The brief asks for a dummy token per role, not an identity provider |
| Money | `BIGINT` minor units in one configured currency (`CURRENCY`, default `AUD`) | No floating-point money |
| Roles | `OPERATOR`, `AGENT`, `CUSTOMER`, plus `STATION` | The brief's three actors, plus the cabinet itself — retrieval is called by hardware, not by a logged-in customer |
| Rate limits | Two Redis counters behind ports in `packages/domain/`, both failing open | Wrong codes per door and codes issued per parcel are different things guarding different risks — guessing and cost — so they never share a budget |

### Trade-offs

Two choices here cost something real, and both could reasonably have gone the other way.

**No ORM.** Repositories are `mysql2` and hand-written SQL, with a private `toPackage(row)` doing
the mapping. The price is paid on every read: a row-to-entity mapper per aggregate, kept in step
with the schema by hand, with nothing checking the SQL until it runs. A TypeORM or Prisma layer
would delete that mapping code and generate the migrations.

It buys two things this particular service needs. The first is that the layering rule holds
literally rather than by convention — `domain/` imports from nothing, so there is no `@Entity()`, no
`@Column()`, no lazy-loading proxy reaching into an aggregate that is supposed to enforce its own
invariants. The second is that the interesting queries stay visible. The core of this app is a
`SELECT ... FOR UPDATE SKIP LOCKED` that picks the smallest free locker, a `UNIQUE` over a generated
column, and a rate lookup written to be answered by one index. None of those is something an ORM
expresses well; you end up dropping to raw SQL for exactly the parts that matter, and then you are
maintaining both. The calculus flips with breadth: a large CRUD surface of shallow entities is where
the generated mapping earns back its cost, and this is a narrow domain with a few sharp queries.

**Lua for the attempt counter.** Five wrong pickup codes at one locker close that door for fifteen
minutes, counted in Redis against the locker id and cleared on a successful retrieval — and the same
two scripts, under a different key, cap how many codes one parcel may be re-issued.
`shared/redis/attempt-counter.scripts.ts` holds them as Lua, registered with `defineScript` so they
go out as `EVALSHA`. This is Redis-side Lua, not a JS `eval`
— keys and arguments travel as separate protocol arguments and nothing is compiled in-process — but
it is still a second language in the repo, exercisable only against a real Redis (hence
`test/pickup-attempt-limiter.e2e-spec.ts` rather than a unit spec), and `defineScript`'s reply
typing needs a cast to describe a plain integer.

Lua earns that when a script branches on a value it just read and writes differently as a result.
Neither of these does: one is two unconditional commands, and the other reads `GET` and `PTTL` and
then does arithmetic that could as easily happen in TypeScript. A `MULTI`/`EXEC` gives the same
atomicity — a transaction whose `EXEC` never arrives is discarded, which is the dropped-connection
case the scripts exist to prevent — in the same single round trip, with no Lua at all. That is the
simplification to make if this file is ever touched again.

The third option, a library, was considered and rejected on shape rather than on principle.
`@nestjs/throttler` is a guard: it counts requests before the handler runs, so it cannot tell a
wrong pickup code from an unknown locker and has no way to clear the counter on success — and those
two distinctions are the entire point of this limiter. Counting an unknown locker would let a
mistyped id freeze a door with someone's parcel behind it, and not clearing on success would leave a
door cold for a customer who already collected after four bad guesses.
`rate-limiter-flexible` is the right shape, with `blockDuration`
matching the policy exactly, and would be the choice if the counting logic grew beyond one key.

### Adapting the reference schema

The brief ships a PostgreSQL reference model; `migrations/001_init.sql` is its MySQL port.

- `gen_random_uuid()` / `timestamptz` → `CHAR(36)` and `DATETIME(6)` UTC, both supplied by the
  application through the ports above.
- **Partial unique index** `one_active_package_per_locker` → MySQL has no partial index, so
  `active_locker_id` is a `STORED` generated column (the locker id while `retrieved_at IS NULL`,
  `NULL` after) with a plain `UNIQUE` over it. Same guarantee; it is the Level 4 backstop above.
- The reference `active_pickup_code` index is dropped — retrieval is by `{ lockerId, pickupCode }`,
  so a code only has to be distinct *within* a locker, which the locker key already gives.
- `EXCLUDE USING gist` (no overlapping rate bands) has no MySQL equivalent. A version's bands are
  validated as a whole schedule in the domain at publish time, backed by
  `uq_storage_rate_band (size_code, effective_from, from_day)` so a concurrent republish fails on
  the key instead of double-charging a day, with a seed test over the shipped schedules.
- `CHECK` constraints are kept — MySQL enforces them from 8.0.16, hence the `mysql:8.4` image.
  `btree_gist`, `pgcrypto` and `int4range` are dropped.
- The `locker_size` reference table is dropped. Size is a closed enum already modelled by the
  `LockerSize` value object, so the table only restated its ordering — and a sort key living in a
  joined table cannot be served by an index on `locker`. `size_code` carries a `CHECK`, and the
  generated `size_rank` column carries `LockerSize.rank` for the allocation index
  (`migrations/005_locker_size_rank.sql` has the measurement).
