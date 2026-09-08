-- 004_listing_sort_indexes.sql
--
-- Indexes that let the paged listings be answered by an index walk instead of
-- sorting the whole matched set.
--
-- Background: `ORDER BY` can only skip a sort when an index already holds the
-- rows in the order asked for. Every listing sort was missing such an index, so
-- MySQL read every matching row, sorted it, and threw away all but one page —
-- the plan reads `Using filesort`, and it costs the same whether the page is
-- the first or the last. Measured on 200k lockers: 214ms before, 0.74ms after.
--
-- Each index ends in the same tiebreakers the adapter's ORDER BY appends
-- (`code`, then `id`), because a prefix match is not enough: the index only
-- spares the sort if it covers the *whole* ordering, tiebreakers included.
-- Those tiebreakers are what makes paging sound, so they are not optional.
--
-- Not every sort can be served this way. `station` orders by `locker_station.
-- name` and the package listing's `storedAt`/`retrievedAt` order by columns in
-- `locker_assignment`; ordering happens after joining, so no index on the base
-- table can spare those sorts. They stay filesorts by construction, bounded in
-- practice by the filters applied alongside them.

-- MySQL has no `ADD KEY IF NOT EXISTS`, so these cannot be written to re-run
-- safely the way 001 is; both locker indexes go in one statement so the table
-- is walked once and there is no half-applied state to clean up between them.
--
--   ix_locker_code       the default listing, `ORDER BY l.code ASC, l.id ASC`.
--                        `uq_locker_code_per_station (station_id, code)` cannot
--                        serve it: an index is ordered by its leading column,
--                        so a code order spanning stations can't use one that
--                        leads with station_id.
--   ix_locker_created_at `?sortBy=createdAt`, newest or oldest across stations.
ALTER TABLE locker
  ADD KEY ix_locker_code (code, id),
  ADD KEY ix_locker_created_at (created_at, code, id);

-- The operator package listing defaults to `ORDER BY p.created_at DESC, p.id`.
-- `ix_package_customer (customer_id, created_at)` already answers the
-- customer-scoped listing (`GET /packages/mine`), whose customer_id equality
-- makes created_at the next ordered column; the unscoped operator listing has
-- no such equality and needs created_at leading.
ALTER TABLE package
  ADD KEY ix_package_created_at (created_at, id);
