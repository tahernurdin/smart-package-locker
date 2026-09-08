export const PICKUP_ATTEMPT_LIMITER = Symbol('PICKUP_ATTEMPT_LIMITER');

/** How long the caller must wait before the door will listen again. */
export interface PickupAttemptBlock {
  retryAfterSeconds: number;
}

/**
 * Caps how often one customer may present the wrong pickup code at one locker
 * door, so a 6-digit code cannot be guessed by repetition.
 *
 * Only a wrong code counts. The other ways a pickup is refused — an unknown
 * locker, an empty one, a parcel that is someone else's — are not guesses at a
 * code, and counting them would spend an honest customer's budget on a mistyped
 * locker id or a parcel a family member already collected.
 *
 * Attempts are counted against the *caller* — the authenticated subject — and
 * the locker they named. Never against the parcel's owner: a counter keyed on
 * the victim would hand anyone a way to lock a customer out of their own
 * parcel with a handful of junk requests.
 *
 * Implementations fail open. This limiter guards a door people stand in front
 * of, and a customer who cannot reach their parcel because a counter store is
 * unreachable is a worse, more visible failure than a brute-force cap that is
 * briefly off.
 */
export interface PickupAttemptLimiter {
  /** `null` while the caller may still attempt; a block once they may not. */
  check(
    customerId: string,
    lockerId: string,
  ): Promise<PickupAttemptBlock | null>;

  /** Counts one failed attempt and refreshes how long a block would last. */
  recordFailure(customerId: string, lockerId: string): Promise<void>;

  /** Forgets the attempts — the parcel was collected. */
  clear(customerId: string, lockerId: string): Promise<void>;
}
