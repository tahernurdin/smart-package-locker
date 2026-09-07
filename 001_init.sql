-- 001_init.sql
-- Smart Package Locker Management System - initial schema (PostgreSQL 14+)
--
-- Conventions
--   * All money is stored as bigint in minor units (cents). Never floating point.
--     Currency is single-valued for the whole system and lives in application config.
--   * All day ranges are half-open: [from_day, to_day). to_day NULL means open-ended.
--   * Timestamps are timestamptz and are always set server-side.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ---------------------------------------------------------------------------
-- locker_size
--
-- A reference table rather than a native enum. `rank` gives a total ordering,
-- which is what "assign the smallest locker that fits" needs - the allocator
-- filters on rank >= required and orders by rank ASC. Gaps in rank (10/20/30)
-- leave room to insert a new size without renumbering or an enum migration.
-- ---------------------------------------------------------------------------
CREATE TABLE locker_size (
    code        text PRIMARY KEY,
    rank        int  NOT NULL UNIQUE,
    label       text NOT NULL,
    CONSTRAINT locker_size_rank_positive CHECK (rank > 0)
);


-- ---------------------------------------------------------------------------
-- locker_station
--
-- The physical site holding a bank of lockers. The challenge only ever
-- describes a single station; this exists because the scenario explicitly
-- frames lockers as living inside stations and multi-site is the obvious
-- extension. Drop this table and locker.station_id if you want it out.
-- ---------------------------------------------------------------------------
CREATE TABLE locker_station (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    location    text,
    created_at  timestamptz NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- locker
--
-- `code` is the human-facing identifier the customer types at the kiosk
-- ("A-01"), unique within its station. `status` covers only serviceability -
-- occupancy is NOT stored here. Whether a locker is free is derived from
-- whether it has an active package (see one_active_package_per_locker below),
-- which keeps a single source of truth and removes any chance of the flag
-- drifting out of sync with reality.
-- ---------------------------------------------------------------------------
CREATE TABLE locker (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id  uuid NOT NULL REFERENCES locker_station(id) ON DELETE RESTRICT,
    code        text NOT NULL,
    size_code   text NOT NULL REFERENCES locker_size(code) ON DELETE RESTRICT,
    status      text NOT NULL DEFAULT 'IN_SERVICE',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT locker_code_unique_per_station UNIQUE (station_id, code),
    CONSTRAINT locker_status_valid CHECK (status IN ('IN_SERVICE', 'OUT_OF_SERVICE'))
);

-- Supports the allocator's filter (station + serviceable) before the join to
-- locker_size for ordering by rank.
CREATE INDEX locker_station_status_idx
    ON locker (station_id, status);


-- ---------------------------------------------------------------------------
-- package
--
-- customer_id is an opaque reference to a customer owned by a separate customer
-- service - there is no local customer table and no FK. The pickup code is
-- assumed to be delivered to that customer by an external notification system
-- (SMS/email); both are out of scope here.
--
-- One row is one occupancy episode: a package assigned to a locker, bracketed
-- by stored_at and retrieved_at. Rows are never deleted on pickup - the history
-- is what the fee calculation and any later audit are built on.
--
-- pickup_code_hash stores a hash, never the code itself. Retrieval looks up the
-- active package by locker_id and then compares hashes in constant time, so the
-- plaintext code never needs to be queryable.
--
-- storage_fee_minor is a snapshot written at retrieval. Because it is captured
-- rather than recomputed, later edits to the rate table cannot silently change
-- what a past customer was charged.
--
-- stored_at is DEFAULT now() and should never be supplied by a client: it is the
-- input to the fee calculation, so a client-controlled value would be a
-- fee-manipulation vector. Tests vary time through an injected clock instead.
-- ---------------------------------------------------------------------------
CREATE TABLE package (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    locker_id           uuid NOT NULL REFERENCES locker(id) ON DELETE RESTRICT,
    customer_id         uuid NOT NULL,
    size_code           text NOT NULL REFERENCES locker_size(code) ON DELETE RESTRICT,
    pickup_code_hash    text NOT NULL,
    tracking_ref        text,
    stored_by_agent     text,
    stored_at           timestamptz NOT NULL DEFAULT now(),
    retrieved_at        timestamptz,
    storage_fee_minor   bigint,
    CONSTRAINT package_retrieved_after_stored
        CHECK (retrieved_at IS NULL OR retrieved_at >= stored_at),
    CONSTRAINT package_fee_set_iff_retrieved
        CHECK ((retrieved_at IS NULL) = (storage_fee_minor IS NULL)),
    CONSTRAINT package_fee_non_negative
        CHECK (storage_fee_minor IS NULL OR storage_fee_minor >= 0)
);

-- THE core invariant: a locker holds at most one package at a time.
-- This is enforced here rather than in application code so it holds regardless
-- of how many service instances are running or how requests interleave. Two
-- concurrent agents racing for the same locker produce a constraint violation,
-- not a double-booking. Doubling as the occupancy lookup, this index is also
-- what makes "is this locker free" cheap.
CREATE UNIQUE INDEX one_active_package_per_locker
    ON package (locker_id)
    WHERE retrieved_at IS NULL;

-- Pickup codes are unique among ACTIVE packages, not globally unique forever.
-- A short numeric code has a small keyspace; requiring lifetime uniqueness would
-- make generation progressively slower and eventually impossible as history
-- accumulates. Uniqueness only has to disambiguate live packages.
CREATE UNIQUE INDEX active_pickup_code
    ON package (pickup_code_hash)
    WHERE retrieved_at IS NULL;

CREATE INDEX package_customer_idx
    ON package (customer_id, stored_at DESC);


-- ---------------------------------------------------------------------------
-- storage_rate
--
-- Per-size, per-band absolute daily rates. The brief's X / 2X / 3X example is
-- one configuration of this table, not the only one it can express - a free
-- first day is simply rate_minor = 0, which a multiplier model represents
-- awkwardly.
--
-- Bands are half-open [from_day, to_day). Bands are versioned by
-- effective_from; because package.storage_fee_minor is snapshotted at
-- retrieval, changing rates never rewrites a past charge.
-- ---------------------------------------------------------------------------
CREATE TABLE storage_rate (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    size_code       text   NOT NULL REFERENCES locker_size(code) ON DELETE RESTRICT,
    from_day        int    NOT NULL,
    to_day          int,
    rate_minor      bigint NOT NULL,
    effective_from  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT storage_rate_from_day_non_negative CHECK (from_day >= 0),
    CONSTRAINT storage_rate_band_ordered CHECK (to_day IS NULL OR to_day > from_day),
    CONSTRAINT storage_rate_non_negative CHECK (rate_minor >= 0)
);

-- Overlapping bands for the same size within the same rate version are
-- impossible. Gaps between bands are not expressible as a constraint and are
-- covered by a seed/config test instead.
ALTER TABLE storage_rate
    ADD CONSTRAINT storage_rate_no_overlapping_bands
    EXCLUDE USING gist (
        size_code      WITH =,
        effective_from WITH =,
        int4range(from_day, to_day) WITH &&
    );

CREATE INDEX storage_rate_lookup_idx
    ON storage_rate (size_code, effective_from DESC);


-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
INSERT INTO locker_size (code, rank, label) VALUES
    ('SMALL',  10, 'Small'),
    ('MEDIUM', 20, 'Medium'),
    ('LARGE',  30, 'Large');

-- Illustrative rates. First day free, then escalating bands per size.
INSERT INTO storage_rate (size_code, from_day, to_day, rate_minor) VALUES
    ('SMALL',  0, 1,    0),
    ('SMALL',  1, 3,  600),
    ('SMALL',  3, 6,  800),
    ('SMALL',  6, NULL, 1000),

    ('MEDIUM', 0, 1,    0),
    ('MEDIUM', 1, 3,  900),
    ('MEDIUM', 3, 6, 1200),
    ('MEDIUM', 6, NULL, 1500),

    ('LARGE',  0, 1,    0),
    ('LARGE',  1, 3, 1400),
    ('LARGE',  3, 6, 1800),
    ('LARGE',  6, NULL, 2200);

COMMIT;
