# Tasks — Level 1: Basic Locker and Package Storage

Level 1 scope (from the brief):

- Create lockers of different sizes.
- View the list of lockers with their current availability status.
- Delivery agents store packages for customers.
- On store: find an available locker that fits the package size, prefer the **smallest** fitting
  locker, generate a pickup code, return the locker identifier. If none fits, return a
  "cannot be stored" message.

**Out of scope for Level 1** (later task sets): customer retrieval (L2), storage fees (L3),
concurrency hardening — `FOR UPDATE SKIP LOCKED` + retry (L4).

See `../docs/implementation-plan.md` for the overall design and decisions.

## Order

| # | Task | Depends on | Status |
|---|---|---|---|
| 01 | [Project infrastructure & tooling](task-01-project-infra.md) | — | ✅ Done |
| 02 | [Database connection & migrations](task-02-database-and-migrations.md) | 01 | ✅ Done |
| 03 | [Shared kernel](task-03-shared-kernel.md) | 01 | Not started |
| 04 | [Auth — dummy JWT per role](task-04-auth.md) | 01, 03 | Not started |
| 05 | [Lockers context](task-05-lockers-context.md) | 02, 03, 04 | Not started |
| 06 | [Customers context](task-06-customers-context.md) | 02, 03 | Not started |
| 07 | [Store package](task-07-store-package.md) | 03, 04, 05, 06 | Not started |
| 08 | [Level 1 end-to-end + docs](task-08-level1-e2e.md) | 05, 07 | Not started |

## Conventions (all tasks)

- Follow `../CLAUDE.md`: inward-pointing layers, framework-free `domain/`, repository ports bound
  via injection tokens, injected `Clock` / generators, typed `DomainError`s mapped to HTTP at the
  edge.
- ESM: every relative import ends in `.js`.
- Each use-case service ships with a Vitest spec (success path + each domain error), using in-memory
  fake repositories.
- `npm run lint` and `npm run build` stay green after every task.
