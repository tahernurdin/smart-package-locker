import type { LockerSize } from '../../lockers/domain/locker-size.js';

export const STORAGE_FEE_POLICY = Symbol('STORAGE_FEE_POLICY');

export interface StorageFeeInput {
  size: LockerSize;
  storedAt: Date;
  retrievedAt: Date;
}

export interface StorageFeePolicy {
  /** Total storage fee in minor units (cents). */
  calculate(input: StorageFeeInput): Promise<number>;
}
