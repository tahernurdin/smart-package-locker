-- 001_init.sql  (MySQL 8.0.16+ / 8.4)
-- MySQL-dialect port of the reference PostgreSQL schema supplied with the brief.
--
-- Conventions
--   * Money is BIGINT minor units (cents). Never floating point. Currency is
--     single-valued and lives in application config.
--   * Day ranges are half-open [from_day, to_day); to_day NULL means open-ended.
--   * ids (CHAR(36) UUIDs) and DATETIME(6) values are always supplied by the
--     application, never by DB defaults, so behaviour is deterministic in tests.

-- A site holding a bank of lockers. Operators manage these directly.
--
-- `status` is a lifecycle, not a delete flag: rows are never removed, because
-- `locker.station_id` (and through it the assignment history) references them.
-- DECOMMISSIONED is terminal — a retired station is hidden from the default
-- listing and refuses new lockers.
CREATE TABLE IF NOT EXISTS locker_station (
  id         CHAR(36)     NOT NULL,
  name       VARCHAR(120) NOT NULL,
  location   VARCHAR(255) NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(6)  NOT NULL,
  updated_at DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_locker_station_status (status),
  CONSTRAINT chk_station_status CHECK (status IN ('ACTIVE', 'DECOMMISSIONED'))
);

CREATE TABLE IF NOT EXISTS locker (
  id         CHAR(36)    NOT NULL,
  station_id CHAR(36)    NOT NULL,
  code       VARCHAR(30) NOT NULL,
  size_code  VARCHAR(20) NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'IN_SERVICE',
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_locker_code_per_station (station_id, code),
  KEY ix_locker_station_status (station_id, status),
  CONSTRAINT fk_locker_station FOREIGN KEY (station_id) REFERENCES locker_station (id),
  -- IN_SERVICE / OUT_OF_SERVICE toggle (maintenance); DECOMMISSIONED is terminal
  -- and stands in for a delete — the row survives so locker_assignment history
  -- keeps its referent. Only IN_SERVICE lockers are allocated to packages.
  CONSTRAINT chk_locker_status
    CHECK (status IN ('IN_SERVICE', 'OUT_OF_SERVICE', 'DECOMMISSIONED')),
  CONSTRAINT chk_locker_size   CHECK (size_code IN ('SMALL', 'MEDIUM', 'LARGE'))
);

-- The parcel. Registered (order / carrier feed) against a customer_id, then
-- dropped by an agent, then collected. The storage episode lives in
-- locker_assignment.
--
-- customer_id is an opaque reference to a customer owned by a separate customer
-- service: no local `customer` table, no FK. Creating / updating / notifying
-- customers (incl. delivering the pickup code) is out of scope per the brief.
CREATE TABLE IF NOT EXISTS package (
  id           CHAR(36)     NOT NULL,
  customer_id  CHAR(36)     NOT NULL,
  size_code    VARCHAR(20)  NOT NULL,
  tracking_ref VARCHAR(120) NULL,
  status       VARCHAR(20)  NOT NULL,
  created_at   DATETIME(6)  NOT NULL,
  updated_at   DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY ix_package_customer (customer_id, created_at),
  CONSTRAINT chk_package_size   CHECK (size_code IN ('SMALL', 'MEDIUM', 'LARGE')),
  CONSTRAINT chk_package_status CHECK (status IN ('REGISTERED', 'STORED', 'RETRIEVED'))
);

-- One storage episode: a package occupying a locker, bracketed by stored_at and
-- retrieved_at. Rows are never deleted on pickup - the history backs the fee
-- calculation and any audit.
CREATE TABLE IF NOT EXISTS locker_assignment (
  id                CHAR(36)     NOT NULL,
  package_id        CHAR(36)     NOT NULL,
  locker_id         CHAR(36)     NOT NULL,
  pickup_code_hash  CHAR(64)     NOT NULL,
  stored_by_agent   VARCHAR(120) NULL,
  stored_at         DATETIME(6)  NOT NULL,
  retrieved_at      DATETIME(6)  NULL,
  storage_fee_minor BIGINT       NULL,
  -- NULL once retrieved, so the UNIQUE key below only constrains *active* rows.
  active_locker_id CHAR(36)
    GENERATED ALWAYS AS (IF(retrieved_at IS NULL, locker_id, NULL)) STORED,
  PRIMARY KEY (id),
  -- THE core invariant: a locker holds at most one active package. Enforced here
  -- so it holds under any request interleaving — a race yields ER_DUP_ENTRY.
  UNIQUE KEY uq_one_active_assignment_per_locker (active_locker_id),
  -- The mirror invariant, and it needs no active_* column: a package has exactly
  -- one storage episode (RETRIEVED is terminal) where a locker has many, so a
  -- plain UNIQUE holds. Doubles as the index for package_id lookups.
  UNIQUE KEY uq_one_assignment_per_package (package_id),
  CONSTRAINT fk_assignment_package FOREIGN KEY (package_id) REFERENCES package (id),
  CONSTRAINT fk_assignment_locker  FOREIGN KEY (locker_id)  REFERENCES locker (id),
  CONSTRAINT chk_assignment_retrieved_after_stored
    CHECK (retrieved_at IS NULL OR retrieved_at >= stored_at),
  CONSTRAINT chk_assignment_fee_iff_retrieved
    CHECK ((retrieved_at IS NULL) = (storage_fee_minor IS NULL)),
  CONSTRAINT chk_assignment_fee_non_negative
    CHECK (storage_fee_minor IS NULL OR storage_fee_minor >= 0)
);

CREATE TABLE IF NOT EXISTS storage_rate (
  id             CHAR(36)    NOT NULL,
  size_code      VARCHAR(20) NOT NULL,
  from_day       INT         NOT NULL,
  to_day         INT         NULL,
  rate_minor     BIGINT      NOT NULL,
  effective_from DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_storage_rate_lookup (size_code, effective_from),
  CONSTRAINT chk_storage_rate_size CHECK (size_code IN ('SMALL', 'MEDIUM', 'LARGE')),
  CONSTRAINT chk_storage_rate_from_day_non_negative CHECK (from_day >= 0),
  CONSTRAINT chk_storage_rate_band_ordered CHECK (to_day IS NULL OR to_day > from_day),
  CONSTRAINT chk_storage_rate_non_negative CHECK (rate_minor >= 0)
  -- Nothing here stops two bands of the same size from overlapping; that needs a
  -- range-exclusion constraint MySQL doesn't have. A seed test covers it instead.
);
