# Smart Package Locker Management System

A REST service where delivery **agents** store packages in size-appropriate lockers and
**customers** retrieve them with a pickup code. **Operators** manage the lockers.

Built with NestJS + MySQL in a layered/clean architecture. See
[`docs/implementation-plan.md`](docs/implementation-plan.md) for the design and
[`CLAUDE.md`](CLAUDE.md) for the engineering conventions. Work is tracked as task specs under
[`tasks/`](tasks/).

## Status

| Level | Scope | State |
|---|---|---|
| 1 | Create lockers, list with availability, store package (smallest-fit + pickup code) | ✅ Done |
| 2 | Customer retrieval (locker id + pickup code), locker freed on pickup | ✅ Done |
| 3 | Tiered extended-storage fees | ⏳ Planned |
| 4 | Concurrency hardening (`FOR UPDATE SKIP LOCKED` + retry) | ⏳ Planned |

The one-active-package-per-locker invariant is already enforced at the database
(a unique index over a generated column), so concurrent stores never double-book a locker even
before Level 4.

## Quickstart (Docker)

```bash
docker compose up --build
```

Brings up MySQL 8.4 and the API on `http://localhost:3000`. Schema migrations run automatically on
boot. With `AUTH_DEV_TOKENS=true` (the default in the compose file), one JWT per role is printed in
the API logs on startup.

Health check:

```bash
curl localhost:3000/health          # {"status":"ok","db":"up"}
```

## Getting a token

Every `/lockers` and `/packages` route needs `Authorization: Bearer <token>` for the right role
(`OPERATOR`, `AGENT`, `CUSTOMER`). In dev, mint one:

```bash
curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
  -d '{"role":"OPERATOR"}'
# {"token":"eyJ…","role":"OPERATOR"}
```

or read them from the startup logs, or run `npm run token -- --role AGENT`.

## Walkthrough

```bash
OP=$(curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
      -d '{"role":"OPERATOR"}' | jq -r .token)
AGENT=$(curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
      -d '{"role":"AGENT"}' | jq -r .token)

# Operator: create lockers of each size
for s in SMALL MEDIUM LARGE; do
  curl -sXPOST localhost:3000/lockers -H "authorization: Bearer $OP" \
    -H 'content-type: application/json' -d "{\"code\":\"A-$s\",\"size\":\"$s\"}"
done

# Operator: list lockers with availability
curl -s localhost:3000/lockers -H "authorization: Bearer $OP"

# Agent: store a package — assigned the smallest locker that fits
STORED=$(curl -sXPOST localhost:3000/packages -H "authorization: Bearer $AGENT" \
  -H 'content-type: application/json' \
  -d '{"size":"SMALL","customer":{"name":"Jo","email":"jo@example.com"}}')
echo "$STORED"
# {"packageId":"…","lockerId":"…","lockerCode":"A-SMALL","pickupCode":"482913"}

# Customer: retrieve it with the locker id + pickup code
CUSTOMER=$(curl -sXPOST localhost:3000/auth/dev-token -H 'content-type: application/json' \
      -d '{"role":"CUSTOMER"}' | jq -r .token)
curl -sXPOST localhost:3000/packages/retrieve -H "authorization: Bearer $CUSTOMER" \
  -H 'content-type: application/json' \
  -d "{\"lockerId\":$(jq .lockerId <<<"$STORED"),\"pickupCode\":$(jq .pickupCode <<<"$STORED")}"
# {"packageId":"…","lockerCode":"A-SMALL","retrievedAt":"…",
#  "storageFee":{"amountMinor":0,"currency":"AUD"},"opened":true}
# — the locker is now FREE again.
```

If no serviceable locker fits, the store call returns `409 no_suitable_locker`. A retrieval that
doesn't match a locker + active package + pickup code returns `404 retrieval_failed` (the same for
all three, so nothing leaks).

## Endpoints

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/health` | — | Liveness + DB check |
| `POST` | `/auth/dev-token` | — (dev only) | Mint a token for `{ role }` |
| `POST` | `/lockers` | Operator | Create a locker `{ code, size, stationId? }` |
| `GET` | `/lockers` | Operator | List lockers with `FREE`/`OCCUPIED` |
| `POST` | `/packages` | Agent | Store `{ size, customer{name,email?,phone?}, trackingRef? }` |
| `POST` | `/packages/retrieve` | Customer | Retrieve `{ lockerId, pickupCode }` — opens the locker, returns the fee |

## Local development (without Docker)

```bash
cp .env.example .env          # point DATABASE_URL at your MySQL 8
npm install
npm run db:migrate            # apply migrations/*.sql
npm run start:dev
```

## Tests

```bash
npm run test                  # unit tests (no DB)
npm run lint
docker compose up -d mysql    # e2e needs a MySQL
npm run test:e2e              # includes the full Level 1 + Level 2 flows
```

Run one test file or case:

```bash
npx vitest run src/packages/application/store-package.service.spec.ts
npx vitest run -t "assigns the smallest locker that fits"
```

## Layout

```
src/
  shared/       config, database (pool + migrator), clock, id, pickup-code, errors, auth
  lockers/      domain / application / infrastructure / interface  (+ module)
  customers/    domain / application / infrastructure              (+ module)
  packages/     domain / application / infrastructure / interface  (+ module)
migrations/     *.sql, applied in order and tracked in schema_migrations
tasks/          per-task specs (Level 1: 01–08, Level 2: 09–12)
```

Dependencies point inward: HTTP → application → domain; infrastructure implements domain ports and
is bound to them in each feature module.
