# Task 02 — Database connection & migrations

**Level:** 1 · **Depends on:** 01 · **Status:** Done

> `rank` is a reserved word in MySQL 8 → column is `` `rank` `` (backticked) in SQL.
> `db:migrate` runs `nest build` first (compiled ESM + `.js` specifiers can't be run
> straight from `.ts`). Verified against `mysql:8.4`: schema + seed applied on boot, re-run is
> a no-op, duplicate active package → `ER_DUP_ENTRY`, CHECK constraints enforced.

## Goal

A shared MySQL connection pool, a small forward-only migration runner, and the initial schema
(MySQL dialect of `001_init.sql`) plus reference/seed data.

## Scope

**In**

- `src/shared/database/` :
  - `mysql.pool.ts` — `createPool` from config, exported via an injection token
    (`MYSQL_POOL`). One pool for the app; a separate short-lived connection with
    `multipleStatements: true` for migrations only.
  - `database.module.ts` — global module providing the pool; `onModuleDestroy` ends it.
  - `transaction.ts` — `withTransaction(pool, fn)` helper (`BEGIN` / `COMMIT` / `ROLLBACK`).
  - `migrator.ts` — reads `migrations/*.sql` sorted by filename; ensures
    `schema_migrations(name PK, applied_at DATETIME(6))`; runs each unapplied file in a
    transaction; records it.
- `npm run db:migrate` script (standalone entrypoint) **and** run the migrator on API boot before
  `app.listen`.
- Wire `GET /health` db check to `SELECT 1`.
- `migrations/001_init.sql` — MySQL 8.0.16+ DDL for: `locker_size`, `locker_station`, `locker`,
  `customer`, `package`, `storage_rate`. Key adaptations:
  - `CHAR(36)` ids (app-supplied), `DATETIME(6)` UTC (app-supplied), `VARCHAR` text columns.
  - `package` gets STORED generated columns
    `active_locker_id AS (IF(retrieved_at IS NULL, locker_id, NULL))` and
    `active_pickup_code_hash AS (IF(retrieved_at IS NULL, pickup_code_hash, NULL))`, each with a
    `UNIQUE` constraint — this enforces "one active package per locker" and active pickup-code
    uniqueness.
  - Keep the `CHECK` constraints from `001_init.sql` (status enum, contact-required,
    retrieved-after-stored, fee-iff-retrieved, non-negative fee, rate band ordering).
  - Drop Postgres-only bits: extensions, `EXCLUDE USING gist`, `int4range`.
- `migrations/002_seed.sql` — `locker_size` rows (SMALL/10, MEDIUM/20, LARGE/30); one default
  `locker_station`; the `storage_rate` bands from `001_init.sql` (unused until L3, seeded now).

**Out**

- Repository classes → feature tasks.
- `FOR UPDATE SKIP LOCKED` allocation query → L4.

## Files

- create: `src/shared/database/{mysql.pool.ts,database.module.ts,transaction.ts,migrator.ts}`
- create: `src/shared/database/migrate.cli.ts` (for `npm run db:migrate`)
- create: `migrations/001_init.sql`, `migrations/002_seed.sql`
- change: `src/app.module.ts` (import DatabaseModule), `src/main.ts` (run migrator on boot),
  `src/health/health.controller.ts`, `package.json`

## Notes

- Ids and timestamps are always supplied by the application (generators + `Clock`), never DB
  defaults — keeps behaviour deterministic under test.
- Seeds must be idempotent (`INSERT ... ON DUPLICATE KEY UPDATE` or `INSERT IGNORE`) so re-running
  is safe.

## Acceptance criteria

- [ ] `npm run db:migrate` on a fresh `mysql:8.4` applies `001` + `002`; re-running is a no-op.
- [ ] `docker compose up` → api boots, migrations applied automatically, `GET /health` shows
  `db: 'up'`.
- [ ] Inserting a second `package` row for the same `locker_id` with `retrieved_at IS NULL` fails
  with `ER_DUP_ENTRY`.
- [ ] `locker_size`, one `locker_station`, and `storage_rate` rows present after migration.
