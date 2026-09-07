/**
 * The station seeded by `migrations/002_seed.sql`, so the e2e suites have one to
 * work at without creating their own every time.
 *
 * It is a test fixture, not application config: nothing in `src/` defaults to it
 * any more — `POST /lockers` and `POST /packages/:id/store` both require an
 * explicit `stationId`.
 */
export const SEEDED_STATION_ID = '00000000-0000-4000-8000-000000000000';
export const SEEDED_STATION_NAME = 'Default Station';
