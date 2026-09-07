# Task 15 — Storage-rate model + repository

**Level:** 3 · **Depends on:** 12 · **Status:** Done

## Goal

Read the tiered rate bands for a size from the `storage_rate` table (already seeded), picking the
rate **version** that was in effect when the package was stored.

## Background

`storage_rate` columns: `size_code`, `from_day`, `to_day` (nullable), `rate_minor`,
`effective_from`. Bands are half-open `[from_day, to_day)`; `to_day = NULL` is the open-ended tail.
Rows with the same `effective_from` for a size form one *version*; `effective_from` lets rates
change over time without rewriting history.

Seeded bands (per size, `effective_from = 2026-01-01`):

| size | `[0,1)` | `[1,3)` | `[3,6)` | `[6,∞)` |
|---|---|---|---|---|
| SMALL | 0 | 600 | 800 | 1000 |
| MEDIUM | 0 | 900 | 1200 | 1500 |
| LARGE | 0 | 1400 | 1800 | 2200 |

## Scope

**In**

- `src/packages/domain/storage-rate.ts` — `StorageRateBand` value object:
  `readonly fromDay: number`, `readonly toDay: number | null`, `readonly rateMinor: number`.
  Construction validates `fromDay >= 0`, `toDay === null || toDay > fromDay`, `rateMinor >= 0`.
- `src/packages/domain/storage-rate.repository.ts` — port `STORAGE_RATE_REPOSITORY`:
  ```ts
  findBandsFor(size: LockerSize, asOf: Date): Promise<StorageRateBand[]>
  ```
  Returns the bands of the newest version with `effective_from <= asOf`, **sorted by `fromDay`**.
  Empty array when nothing is effective yet.
- `src/packages/infrastructure/mysql-storage-rate.repository.ts`:
  ```sql
  SELECT from_day, to_day, rate_minor
  FROM storage_rate
  WHERE size_code = :size
    AND effective_from = (
      SELECT MAX(effective_from) FROM storage_rate
      WHERE size_code = :size AND effective_from <= :asOf
    )
  ORDER BY from_day
  ```
- Register nothing yet — the policy (Task 16) owns the module wiring.

**Out**

- The fee arithmetic → Task 16.
- Which timestamp is `asOf` — the policy passes `storedAt` (the rate the customer implicitly agreed
  to when the package went in; a later hike must not raise their bill). Documented on the port.
- Admin endpoints to edit rates.

## Files

- create: `src/packages/domain/storage-rate.ts`,
  `src/packages/domain/storage-rate.repository.ts`,
  `src/packages/infrastructure/mysql-storage-rate.repository.ts`,
  `src/packages/domain/storage-rate.spec.ts`

## Acceptance criteria

- [ ] `StorageRateBand` rejects `toDay <= fromDay`, negative `fromDay`, negative `rateMinor`.
- [ ] Unit / integration: `findBandsFor(SMALL, <after 2026-01-01>)` returns the 4 seeded bands in
  `fromDay` order; an `asOf` before any `effective_from` returns `[]`.
- [ ] `npm run lint` / `npm run build` / `npm run test` green.
