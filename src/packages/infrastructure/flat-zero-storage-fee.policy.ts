import { Injectable } from '@nestjs/common';
import type { StorageFeePolicy } from '../domain/storage-fee.policy.js';

/**
 * Level 2 placeholder: storage is free. Level 3 swaps the module binding for a
 * `TieredStorageFeePolicy` — `RetrievePackageService` is unaffected.
 */
@Injectable()
export class FlatZeroStorageFeePolicy implements StorageFeePolicy {
  async calculate(): Promise<number> {
    return 0;
  }
}
