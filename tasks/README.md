# Tasks

- **Level 1 — Basic locker and package storage** (tasks 01–08) — done
- **Level 2 — Package retrieval and locker management** (tasks 09–12) — done
- **Refactors** (tasks 13–14) — done
- **Level 3 — Extended storage charges** (tasks 15–17)

See `../docs/implementation-plan.md` for the overall design and decisions.

---

## Level 1: Basic Locker and Package Storage

Level 1 scope (from the brief):

- Create lockers of different sizes.
- View the list of lockers with their current availability status.
- Delivery agents store packages for customers.
- On store: find an available locker that fits the package size, prefer the **smallest** fitting
  locker, generate a pickup code, return the locker identifier. If none fits, return a
  "cannot be stored" message.

**Out of scope for Level 1** (later task sets): customer retrieval (L2), storage fees (L3),
concurrency hardening — `FOR UPDATE SKIP LOCKED` + retry (L4).

| # | Task | Depends on | Status |
|---|---|---|---|
| 01 | [Project infrastructure & tooling](task-01-project-infra.md) | — | ✅ Done |
| 02 | [Database connection & migrations](task-02-database-and-migrations.md) | 01 | ✅ Done |
| 03 | [Shared kernel](task-03-shared-kernel.md) | 01 | ✅ Done |
| 04 | [Auth — dummy JWT per role](task-04-auth.md) | 01, 03 | ✅ Done |
| 05 | [Lockers context](task-05-lockers-context.md) | 02, 03, 04 | ✅ Done |
| 06 | [Customers context](task-06-customers-context.md) | 02, 03 | ✅ Done |
| 07 | [Store package](task-07-store-package.md) | 03, 04, 05, 06 | ✅ Done |
| 08 | [Level 1 end-to-end + docs](task-08-level1-e2e.md) | 05, 07 | ✅ Done |

## Level 2: Package Retrieval and Locker Management

Level 2 scope (from the brief):

- Customers retrieve a package by giving the **locker id + pickup code** they received.
- On a valid request: the locker opens, the package is removed, the locker becomes available again.
- Invalid scenarios are handled properly.

**Out of scope for Level 2**: the storage-fee *amount* (L3 — retrieval returns a fee of 0 through a
policy seam introduced here), `FOR UPDATE SKIP LOCKED` allocation hardening (L4).

| # | Task | Depends on | Status |
|---|---|---|---|
| 09 | [Retrieval domain transition + repository reads](task-09-retrieval-domain-and-repository.md) | 07 | ✅ Done |
| 10 | [RetrievePackageService (+ fee-policy seam)](task-10-retrieve-package-service.md) | 09 | ✅ Done |
| 11 | [Retrieve package endpoint](task-11-retrieve-package-endpoint.md) | 10 | ✅ Done |
| 12 | [Level 2 end-to-end + docs](task-12-level2-e2e.md) | 11 | ✅ Done |

## Refactors

| # | Task | Depends on | Status |
|---|---|---|---|
| 13 | [Drop the `locker_size` reference table](task-13-drop-locker-size-table.md) | 12 | ✅ Done |
| 14 | [`GET /lockers`: station filter + station in response](task-14-list-lockers-station-filter.md) | 13 | ✅ Done |

## Level 3: Extended Storage Charges

Level 3 scope (from the brief):

- Record when the package was placed in the locker (**already done** — `package.stored_at` since L1).
- Calculate the storage charge from how long the package stayed: a tiered per-day rule (e.g. `X`/day
  for the first days, `2X`, then `3X`), where a "day" is a 24h window from `stored_at`.
- On retrieval, return the total charge with the pickup confirmation (**seam already there** —
  `RetrievePackageService` calls `StorageFeePolicy` and returns `storageFee`; L2 bound a zero
  policy).
- Locker frees on retrieval (**already done** in L2).

So L3 is: implement the real tiered calculation behind the existing seam and swap the binding.

**Out of scope for Level 3**: `FOR UPDATE SKIP LOCKED` allocation hardening + bounded retry (L4).

| # | Task | Depends on | Status |
|---|---|---|---|
| 15 | [Storage-rate model + repository](task-15-storage-rate-repository.md) | 12 | Not started |
| 16 | [Tiered storage-fee calculator + policy](task-16-tiered-storage-fee-policy.md) | 15 | Not started |
| 17 | [Wire the tiered policy + Level 3 e2e + docs](task-17-level3-e2e.md) | 16 | Not started |

## Conventions (all tasks)

- Follow `../CLAUDE.md`: inward-pointing layers, framework-free `domain/`, repository ports bound
  via injection tokens, injected `Clock` / generators, typed `DomainError`s mapped to HTTP at the
  edge.
- ESM: every relative import ends in `.js`.
- Each use-case service ships with a Vitest spec (success path + each domain error), using in-memory
  fake repositories.
- `npm run lint` and `npm run build` stay green after every task.
