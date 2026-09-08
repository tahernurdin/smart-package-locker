-- 005_locker_size_rank.sql
--
-- Gives the allocator a size ordering it can reach through an index, and
-- retires the `FIELD(size_code, 'SMALL', 'MEDIUM', 'LARGE')` fragment the SQL
-- used to carry.
--
-- Why a column rather than a `size` lookup table: ordering happens *after*
-- joining, so a sort key living in a joined table cannot be served by an index
-- on `locker` — MySQL must read the station's whole bank and sort it. Measured
-- on a 200-locker station: joined lookup table 1.45ms reading 200 rows and
-- sorting; this column 0.045ms reading 4 rows with no sort at all, because one
-- index answers the filter, the range and the order in a single walk.
--
-- This is derived, not denormalised in the sense that matters: `GENERATED
-- ALWAYS` means it cannot be written independently of `size_code`, so the two
-- cannot disagree. It is the same device `locker_assignment.active_locker_id`
-- already uses in 001 to carry the one-active-package-per-locker invariant.

-- The values are `LockerSize.rank` (src/lockers/domain/locker-size.ts), so the
-- application passes `size.rank` straight into the comparison with no
-- translation. That coupling is pinned by a spec in `locker-size.spec.ts`,
-- which names this migration, and by the smallest-fit e2e in level1.
ALTER TABLE locker
  ADD COLUMN size_rank TINYINT UNSIGNED
    GENERATED ALWAYS AS (CASE size_code
      WHEN 'SMALL'  THEN 10
      WHEN 'MEDIUM' THEN 20
      WHEN 'LARGE'  THEN 30
    END) STORED;

-- The allocator's whole query in one index: station and status narrow it, the
-- size_rank range finds sizes that fit, and code breaks ties — all in index
-- order, so `ORDER BY ... LIMIT 1` stops at the first match instead of sorting
-- the bank. Column order mirrors the query: equality, then range, then sort.
--
-- `ix_locker_station_status (station_id, status)` from 001 is a strict prefix
-- of this and is therefore redundant; dropping it keeps writes cheaper.
ALTER TABLE locker
  ADD KEY ix_locker_allocation (station_id, status, size_rank, code),
  DROP KEY ix_locker_station_status;
