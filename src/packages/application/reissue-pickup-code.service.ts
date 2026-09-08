import { Inject, Injectable } from '@nestjs/common';
import {
  LOCKER_REPOSITORY,
  type LockerRepository,
} from '../../lockers/domain/locker.repository.js';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import {
  PICKUP_CODE_GENERATOR,
  type PickupCodeGenerator,
} from '../../shared/pickup-code/pickup-code-generator.js';
import { PickupCodeHasher } from '../../shared/pickup-code/pickup-code-hasher.js';
import {
  PackageNotStoredError,
  PickupCodeNotReissuableError,
  TooManyPickupCodeReissuesError,
} from '../domain/errors.js';
import {
  PICKUP_ATTEMPT_LIMITER,
  type PickupAttemptLimiter,
} from '../domain/pickup-attempt-limiter.js';
import {
  PICKUP_CODE_REISSUE_LIMITER,
  type PickupCodeReissueLimiter,
} from '../domain/pickup-code-reissue-limiter.js';
import {
  PACKAGE_REPOSITORY,
  type PackageRepository,
} from '../domain/package.repository.js';

export interface ReissuedPickupCode {
  packageId: string;
  lockerId: string;
  lockerCode: string;
  /** Plaintext, returned exactly once — only the hash is kept. */
  pickupCode: string;
  reissuedAt: Date;
}

/**
 * A customer at the station who no longer has their code: they open the app,
 * ask for a new one for that parcel, and key in what comes back.
 *
 * This is the one code path where identity does the work instead of the code,
 * and it has to be: the caller is asking for the credential, so it can only be
 * answered for a parcel the token's own subject owns. It is the mirror image of
 * retrieval, where the station knows the door but not the person.
 *
 * Capped, but not against guessing: whoever can call this is handed the new
 * code in the response, so they never had to guess at anything. The cap is on
 * cost — each new code is a message to the customer — which is why it counts
 * codes issued and nothing ever gives the budget back. Three on one parcel and
 * that parcel waits out the window.
 *
 * Two counters meet in here and they are not the same thing. This one only ever
 * grows; the *door's* wrong-code counter is cleared on the way out, because a
 * re-issue makes the guesses that earned it meaningless.
 */
@Injectable()
export class ReissuePickupCodeService {
  constructor(
    @Inject(PACKAGE_REPOSITORY) private readonly packages: PackageRepository,
    @Inject(LOCKER_REPOSITORY) private readonly lockers: LockerRepository,
    @Inject(PICKUP_CODE_GENERATOR) private readonly codes: PickupCodeGenerator,
    private readonly hasher: PickupCodeHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PICKUP_CODE_REISSUE_LIMITER)
    private readonly reissues: PickupCodeReissueLimiter,
    @Inject(PICKUP_ATTEMPT_LIMITER)
    private readonly attempts: PickupAttemptLimiter,
  ) {}

  async reissue(
    customerId: string,
    packageId: string,
  ): Promise<ReissuedPickupCode> {
    // Before the parcel is even looked up: a caller who is over their budget
    // learns nothing about it, and nothing is written on their behalf.
    const block = await this.reissues.check(packageId);
    if (block) throw new TooManyPickupCodeReissuesError(block.retryAfterSeconds);

    const pkg = await this.packages.findById(packageId);
    // An unknown parcel and someone else's answer identically: a customer may
    // only ever learn about their own, and a 404 that distinguishes the two
    // turns package ids into something worth guessing.
    if (!pkg || pkg.customerId !== customerId) {
      throw new PickupCodeNotReissuableError();
    }
    // Their own parcel, so this one is safe to name: there is nothing to say
    // about a parcel that has not been dropped yet or was already collected.
    if (pkg.status !== 'STORED' || !pkg.assignment?.isActive) {
      throw new PackageNotStoredError(pkg.status);
    }

    const locker = await this.lockers.findById(pkg.lockerId);
    if (!locker) throw new PickupCodeNotReissuableError();

    const pickupCode = this.codes.generate();
    const now = this.clock.now();
    const reissued = pkg.reissuePickupCode({
      pickupCodeHash: this.hasher.hash(pickupCode),
      now,
    });
    await this.packages.savePickupCode(reissued);

    // TODO(notify): send the new code the same way the drop sends the first one
    // — SMS, push, email:
    //
    //   await this.notifier.pickupCodeReissued({
    //     customerId: pkg.customerId, pickupCode,
    //     lockerCode: locker.code,
    //   });
    //
    // This send is what the cap above is counting: it is the part of a re-issue
    // that costs money and lands on someone's phone. Like the drop's send it
    // must not fail the request — the new code is already the stored one, so
    // throwing here would leave the customer with a code they never saw and an
    // old one that no longer works.

    // Counted only once the new code is the stored one. A budget spent on a
    // code that failed to save would be a code the customer never got.
    await this.reissues.recordIssue(packageId);

    // A different counter, and the only one that is ever cleared: this is the
    // *door's* wrong-code block, earned by guesses at the code this call just
    // made worthless. Leaving it would protect nothing and would strand the
    // customer in front of their own locker. It does not refund anything above
    // — the re-issue budget shrank by one on the line before.
    await this.attempts.clear(locker.id);

    return {
      packageId: reissued.id,
      lockerId: locker.id,
      lockerCode: locker.code,
      pickupCode,
      reissuedAt: now,
    };
  }
}
