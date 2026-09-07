-- 002_seed.sql - reference + demo data. Idempotent (INSERT IGNORE).

INSERT IGNORE INTO locker_size (code, `rank`, label) VALUES
  ('SMALL',  10, 'Small'),
  ('MEDIUM', 20, 'Medium'),
  ('LARGE',  30, 'Large');

-- The single default station. Locker creation uses this when no station is given.
INSERT IGNORE INTO locker_station (id, name, location, created_at) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Default Station', 'HQ',
   '2026-01-01 00:00:00.000000');

-- Illustrative tiered rates: first day free, then escalating half-open bands per
-- size. Consumed from Level 3 onwards.
INSERT IGNORE INTO storage_rate (id, size_code, from_day, to_day, rate_minor, effective_from) VALUES
  ('10000000-0000-0000-0000-000000000001', 'SMALL',  0, 1,     0, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-000000000002', 'SMALL',  1, 3,   600, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-000000000003', 'SMALL',  3, 6,   800, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-000000000004', 'SMALL',  6, NULL, 1000, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-000000000005', 'MEDIUM', 0, 1,     0, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-000000000006', 'MEDIUM', 1, 3,   900, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-000000000007', 'MEDIUM', 3, 6,  1200, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-000000000008', 'MEDIUM', 6, NULL, 1500, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-000000000009', 'LARGE',  0, 1,     0, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-00000000000a', 'LARGE',  1, 3,  1400, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-00000000000b', 'LARGE',  3, 6,  1800, '2026-01-01 00:00:00.000000'),
  ('10000000-0000-0000-0000-00000000000c', 'LARGE',  6, NULL, 2200, '2026-01-01 00:00:00.000000');
