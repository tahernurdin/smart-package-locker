import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfiguration } from '../config/configuration.js';

/**
 * Hashes pickup codes for storage and verifies them in constant time. The
 * plaintext code is never persisted.
 *
 * A pickup code is six digits — the whole keyspace is 10^6, which is seconds of
 * work — so the stored form leans on two things, and they do different jobs:
 *
 *  - **The pepper is the secret**, held in config and never written to the
 *    database (see `loadConfiguration`, which requires it in production). It is
 *    the HMAC key, so without it a leaked `locker_assignment` cannot be
 *    attacked by hashing candidate codes at all. HMAC rather than
 *    `hash(pepper + code)` because that concatenation is the construction HMAC
 *    exists to replace.
 *  - **The assignment id is the salt**, and it does not need to be secret —
 *    that is not a salt's job. It is already the row's primary key, so nothing
 *    extra is stored. Its only job is to give every parcel a different function
 *    from code to digest, so one precomputed pass cracks the single assignment
 *    it was built for instead of every row in the bank at once.
 *
 * The digest is 32 bytes either way, so `pickup_code_hash CHAR(64)` is
 * unchanged. Changing the pepper invalidates every stored hash; the recovery
 * path for a parcel already in a locker is `ReissuePickupCodeService`.
 */
@Injectable()
export class PickupCodeHasher {
  private readonly pepper: string;

  constructor(@Inject(APP_CONFIG) config: AppConfiguration) {
    this.pepper = config.pickupCodePepper;
  }

  hash(code: string, assignmentId: string): string {
    return createHmac('sha256', this.pepper)
      .update(`${assignmentId}:${code}`)
      .digest('hex');
  }

  verify(code: string, assignmentId: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(code, assignmentId), 'hex');
    // A malformed hash decodes to a short (or empty) buffer, which the length
    // check rejects before `timingSafeEqual` can throw on it.
    const expected = Buffer.from(expectedHash, 'hex');
    if (actual.length !== expected.length || expected.length === 0) return false;
    return timingSafeEqual(actual, expected);
  }
}
