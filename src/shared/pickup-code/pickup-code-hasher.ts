import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfiguration } from '../config/configuration.js';

/**
 * Hashes pickup codes for storage and verifies them in constant time. The
 * plaintext code is never persisted.
 */
@Injectable()
export class PickupCodeHasher {
  private readonly pepper: string;

  constructor(@Inject(APP_CONFIG) config: AppConfiguration) {
    this.pepper = config.pickupCodePepper;
  }

  hash(code: string): string {
    return createHash('sha256').update(`${this.pepper}:${code}`).digest('hex');
  }

  verify(code: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(code), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    if (actual.length !== expected.length || expected.length === 0) return false;
    return timingSafeEqual(actual, expected);
  }
}
