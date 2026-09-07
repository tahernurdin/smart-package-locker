import { LockerSize } from '../../lockers/domain/locker-size.js';
import { StorageRateBand } from '../domain/storage-rate.js';
import type { StorageRateRepository } from '../domain/storage-rate.repository.js';
import { TieredStorageFeePolicy } from './tiered-storage-fee.policy.js';

const SMALL_BANDS = [
  StorageRateBand.of({ fromDay: 0, toDay: 1, rateMinor: 0 }),
  StorageRateBand.of({ fromDay: 1, toDay: null, rateMinor: 600 }),
];

describe('TieredStorageFeePolicy', () => {
  it('looks up bands as of storedAt and returns the calculated fee', async () => {
    const seen: { size?: string; asOf?: Date } = {};
    const rates = {
      findBandsFor: async (size: LockerSize, asOf: Date) => {
        seen.size = size.code;
        seen.asOf = asOf;
        return SMALL_BANDS;
      },
    } as unknown as StorageRateRepository;

    const storedAt = new Date('2026-06-01T00:00:00.000Z');
    const retrievedAt = new Date('2026-06-04T00:00:00.000Z'); // 3 days -> 0 + 600 + 600

    const fee = await new TieredStorageFeePolicy(rates).calculate({
      size: LockerSize.of('SMALL'),
      storedAt,
      retrievedAt,
    });

    expect(fee).toBe(1200);
    expect(seen).toEqual({ size: 'SMALL', asOf: storedAt });
  });

  it('throws when no rate is configured for the size', async () => {
    const rates = {
      findBandsFor: async () => [],
    } as unknown as StorageRateRepository;

    await expect(
      new TieredStorageFeePolicy(rates).calculate({
        size: LockerSize.of('MEDIUM'),
        storedAt: new Date(),
        retrievedAt: new Date(),
      }),
    ).rejects.toThrow(/no storage rate configured/);
  });
});
