import { Inject, Injectable } from '@nestjs/common';
import type {
  StorageFeeInput,
  StorageFeePolicy,
} from '../domain/storage-fee.policy.js';
import { calculateStorageFeeMinor } from '../domain/storage-fee-calculator.js';
import { StorageRateConfigError } from '../../storage-rates/domain/errors.js';
import {
  STORAGE_RATE_REPOSITORY,
  type StorageRateRepository,
} from '../../storage-rates/domain/storage-rate.repository.js';

/**
 * Tiered per-day storage fee. Fetches the rate bands effective when the package
 * was stored and delegates the arithmetic to the pure calculator.
 */
@Injectable()
export class TieredStorageFeePolicy implements StorageFeePolicy {
  constructor(
    @Inject(STORAGE_RATE_REPOSITORY)
    private readonly rates: StorageRateRepository,
  ) {}

  async calculate(input: StorageFeeInput): Promise<number> {
    const bands = await this.rates.findBandsFor(input.size, input.storedAt);
    if (bands.length === 0) {
      throw new StorageRateConfigError(
        `no storage rate configured for size ${input.size.code}`,
      );
    }
    return calculateStorageFeeMinor(bands, input.storedAt, input.retrievedAt);
  }
}
