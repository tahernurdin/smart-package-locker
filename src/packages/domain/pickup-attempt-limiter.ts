export const PICKUP_ATTEMPT_LIMITER = Symbol('PICKUP_ATTEMPT_LIMITER');

/** How long the door must wait before it will listen again. */
export interface PickupAttemptBlock {
  retryAfterSeconds: number;
}

/**
 * Caps how often a wrong pickup code may be presented at one locker door, so a
 * 6-digit code cannot be guessed by repetition.
 *
 * The key is the locker, and only the locker. Nobody is logged in at a keypad —
 * the code *is* the identity claim — so there is no caller to count against;
 * what is being defended is one code at one door, which is exactly what a
 * per-locker counter defends. The lockout it imposes falls on that door rather
 * than on a person, and the person it inconveniences is whoever is standing in
 * front of it, which in the physical world is the same one who typed the wrong
 * codes.
 *
 * Only a wrong code counts. The other ways a pickup is refused — an unknown
 * locker, an empty one — are not guesses at a code, and counting them would let
 * a mistyped locker id freeze a door holding someone's parcel.
 *
 * Implementations fail open. This limiter guards a door people stand in front
 * of, and a customer who cannot reach their parcel because a counter store is
 * unreachable is a worse, more visible failure than a brute-force cap that is
 * briefly off.
 */
export interface PickupAttemptLimiter {
  /** `null` while the door may still be tried; a block once it may not. */
  check(lockerId: string): Promise<PickupAttemptBlock | null>;

  /** Counts one failed attempt and refreshes how long a block would last. */
  recordFailure(lockerId: string): Promise<void>;

  /** Forgets the attempts — the parcel was collected. */
  clear(lockerId: string): Promise<void>;
}
