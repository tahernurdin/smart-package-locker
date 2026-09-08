-- 003_storage_rate_versions.sql
--
-- Prepares `storage_rate` to be written by operators rather than only seeded.
--
-- A price change publishes a NEW version — the same size at a later
-- effective_from — and never edits a published row, because the fee is
-- recomputed at retrieval from the rate effective when the package was stored.
-- Editing a row in place would silently rewrite what a customer was already
-- quoted.

-- The created_at / updated_at pair every other table carries. Because rows are
-- immutable once published, updated_at always equals created_at here; it exists
-- so the audit columns are in the same place on every table.
ALTER TABLE storage_rate
  ADD COLUMN created_at DATETIME(6) NULL,
  ADD COLUMN updated_at DATETIME(6) NULL;

-- Seeded rows predate the columns. Their publication instant is effective_from.
UPDATE storage_rate
   SET created_at = effective_from, updated_at = effective_from
 WHERE created_at IS NULL;

-- NOT NULL only after the backfill — the application always supplies both, per
-- the DATETIME convention in 001.
ALTER TABLE storage_rate
  MODIFY COLUMN created_at DATETIME(6) NOT NULL,
  MODIFY COLUMN updated_at DATETIME(6) NOT NULL;

-- The natural key: a version is (size_code, effective_from) holding one band per
-- from_day. This makes republishing a version, or repeating a band inside one,
-- fail on the key instead of double-charging a day — the check in the publish
-- service can't hold under concurrency on its own.
--
-- Its (size_code, effective_from) prefix also answers the fee lookup, so the
-- index 001 added for that is now redundant.
ALTER TABLE storage_rate
  ADD UNIQUE KEY uq_storage_rate_band (size_code, effective_from, from_day),
  DROP KEY ix_storage_rate_lookup;
