# Task 16 — Tiered storage-fee calculator + policy

**Level:** 3 · **Depends on:** 15 · **Status:** Not started

## Goal

Turn "stored at T0, retrieved at T1, size S" into a fee in minor units, using the rate bands. The
arithmetic is a pure domain function; the policy just fetches bands and delegates.

## The calculation

`day` = a 24h window from `stored_at`. Day index `d` (0-based) is `[stored_at + d·24h,
stored_at + (d+1)·24h)`.

**Chargeable days** — pay for each day *started*:

```
durationMs   = retrievedAt - storedAt
chargeableDays = max(0, ceil(durationMs / 86_400_000))
```

- retrieved at the same instant → 0 days → fee 0
- `0 < durationMs <= 24h` → 1 day (index 0 only)
- exactly `24h` → 1; `24h + 1ms` → 2
- `retrievedAt` before `storedAt` (skewed/frozen clock) → clamped to 0

**Per-band sum** — for each `StorageRateBand [fromDay, toDay)` (open-ended `toDay` treated as
`chargeableDays`):

```
end        = toDay === null ? chargeableDays : min(toDay, chargeableDays)
daysInBand = max(0, end - fromDay)
total     += daysInBand * rateMinor
```

**Defensive check** — after summing, the bands must have covered `[0, chargeableDays)` contiguously
from 0. If `sum of daysInBand !== chargeableDays` (a gap or a non-zero start in the seed), throw —
a misconfigured rate table is a server bug, not a silent undercharge.

Worked examples (SMALL: `[0,1)=0 [1,3)=600 [3,6)=800 [6,∞)=1000`):

| days | fee | |
|---|---|---|
| 1 | 0 | first day free |
| 2 | 600 | 0 + 600 |
| 3 | 1200 | 0 + 600 + 600 |
| 4 | 2000 | + 800 |
| 7 | 4600 | 0+600+600+800+800+800+1000 |

## Scope

**In**

- `src/packages/domain/storage-fee-calculator.ts` — pure:
  `calculateStorageFeeMinor(bands: StorageRateBand[], storedAt: Date, retrievedAt: Date): number`.
  Bands are assumed sorted by `fromDay` (the repo guarantees it). Throws on the coverage check.
- `src/packages/infrastructure/tiered-storage-fee.policy.ts` —
  `TieredStorageFeePolicy implements StorageFeePolicy`:
  - inject `STORAGE_RATE_REPOSITORY`.
  - `calculate({ size, storedAt, retrievedAt })` → `findBandsFor(size, storedAt)` → empty ⇒ throw
    `Error('no storage rate configured for size …')` (→ 500 via the filter; operational
    misconfiguration, not a client error) → `calculateStorageFeeMinor(bands, storedAt, retrievedAt)`.
- Delete `src/packages/infrastructure/flat-zero-storage-fee.policy.ts` (the L2 placeholder) — its
  job is done. Module rebinding happens in Task 17.
- Money stays integer minor units throughout; no floats, no rounding (days are integers, rates are
  integers).

**Out**

- Wiring `STORAGE_FEE_POLICY` / `STORAGE_RATE_REPOSITORY` into `PackagesModule` → Task 17.
- Any change to `RetrievePackageService` (the seam already calls the policy).

## Files

- create: `src/packages/domain/storage-fee-calculator.ts`,
  `src/packages/infrastructure/tiered-storage-fee.policy.ts`,
  `src/packages/domain/storage-fee-calculator.spec.ts`,
  `src/packages/infrastructure/tiered-storage-fee.policy.spec.ts`
- delete: `src/packages/infrastructure/flat-zero-storage-fee.policy.ts`

## Acceptance criteria

- [ ] Calculator unit tests (table-driven, SMALL + one other size): 0-duration → 0; `<24h` → day-0
  rate; exactly 24h → 1 day; the worked examples above; a 30-day stay hits the open-ended tail;
  `retrievedAt < storedAt` → 0.
- [ ] Calculator throws when given bands that start at `fromDay = 1` or have a gap.
- [ ] Policy unit test (fake rate repo): delegates with `asOf = storedAt`; throws when the repo
  returns `[]`.
- [ ] `npm run lint` / `npm run build` / `npm run test` green.
