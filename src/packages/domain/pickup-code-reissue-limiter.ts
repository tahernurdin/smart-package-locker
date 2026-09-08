export const PICKUP_CODE_REISSUE_LIMITER = Symbol('PICKUP_CODE_REISSUE_LIMITER');

/** How long until this parcel may be given another code. */
export interface PickupCodeReissueBlock {
  retryAfterSeconds: number;
}

/**
 * Caps how many pickup codes one parcel may be given in a window.
 *
 * Not a guessing defence — the caller of a re-issue is handed the new code, so
 * there is nothing to guess. This caps *cost*: every re-issue puts a message on
 * the wire to the customer, and a loop that mints codes forever is a bill and a
 * phone full of texts. The budget is only spent, never refunded: nothing clears
 * it, so a customer who has burned three codes on a parcel waits, rather than
 * finding a way to reset the count and carry on.
 *
 * The key is the parcel, not the customer: someone churning codes on one
 * delivery cannot leave their other parcels unreachable.
 *
 * Distinct from {@link PickupAttemptLimiter}, which counts wrong codes typed at
 * a locker door and *is* cleared — by a successful pickup, and by a re-issue
 * that makes the guessed-at code worthless. The two must never share a budget:
 * asking for a new code is exactly what an honest customer does after someone
 * has been guessing at their old one.
 *
 * Implementations fail open, like the attempt limiter: a counter store being
 * down must not be what stands between a customer and their parcel.
 */
export interface PickupCodeReissueLimiter {
  /** `null` while another code may be issued; a block once one may not. */
  check(packageId: string): Promise<PickupCodeReissueBlock | null>;

  /** Counts one issued code and restarts the window. */
  recordIssue(packageId: string): Promise<void>;
}
