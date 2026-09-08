import { Inject, Injectable } from '@nestjs/common';
import {
  LOCKER_REPOSITORY,
  type LockerRepository,
} from '../../lockers/domain/locker.repository.js';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import {
  APP_CONFIG,
  type AppConfiguration,
} from '../../shared/config/configuration.js';
import { PickupCodeHasher } from '../../shared/pickup-code/pickup-code-hasher.js';
import {
  PackageNotFoundForRetrievalError,
  TooManyRetrievalAttemptsError,
} from '../domain/errors.js';
import {
  PICKUP_ATTEMPT_LIMITER,
  type PickupAttemptLimiter,
} from '../domain/pickup-attempt-limiter.js';
import {
  PACKAGE_REPOSITORY,
  type PackageRepository,
} from '../domain/package.repository.js';
import type { RetrievePackageDto } from '../interface/dto/retrieve-package.dto.js';
import { PickupCode } from '../domain/pickup-code.js';
import {
  STORAGE_FEE_POLICY,
  type StorageFeePolicy,
} from '../domain/storage-fee.policy.js';

export interface RetrievedPackage {
  packageId: string;
  lockerId: string;
  lockerCode: string;
  retrievedAt: Date;
  storageFee: { amountMinor: number; currency: string };
  opened: true;
}

/**
 * Collection at the locker door. `customerId` is the authenticated subject the
 * controller passes in — never a field on the request — so the pickup code
 * alone opens nothing: it has to be presented by the customer the parcel was
 * registered for.
 */
@Injectable()
export class RetrievePackageService {
  constructor(
    @Inject(LOCKER_REPOSITORY) private readonly lockers: LockerRepository,
    @Inject(PACKAGE_REPOSITORY) private readonly packages: PackageRepository,
    @Inject(STORAGE_FEE_POLICY) private readonly feePolicy: StorageFeePolicy,
    private readonly hasher: PickupCodeHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfiguration,
    @Inject(PICKUP_ATTEMPT_LIMITER)
    private readonly attempts: PickupAttemptLimiter,
  ) {}

  async retrieve(
    customerId: string,
    input: RetrievePackageDto,
  ): Promise<RetrievedPackage> {
    // Before anything is looked up, so a blocked caller learns nothing from
    // how long the answer took or which error came back.
    const block = await this.attempts.check(customerId, input.lockerId);
    if (block) throw new TooManyRetrievalAttemptsError(block.retryAfterSeconds);

    const pickupCode = PickupCode.of(input.pickupCode).value;

    const locker = await this.lockers.findById(input.lockerId);
    if (!locker) throw new PackageNotFoundForRetrievalError();

    const pkg = await this.packages.findActiveByLocker(locker.id);
    if (!pkg) throw new PackageNotFoundForRetrievalError();

    // Someone else's parcel fails exactly like a wrong code — the same 404, so
    // a leaked code tells its finder nothing about what that locker holds.
    if (!pkg.belongsTo(customerId)) {
      throw new PackageNotFoundForRetrievalError();
    }

    // The only counted failure: a real parcel of the caller's own, opened with
    // the wrong code. That is the guess a limiter can meaningfully cap, and
    // narrowing it here keeps an honest customer who mistypes a locker id, or
    // returns to one already emptied, from spending their budget on it.
    if (!this.hasher.verify(pickupCode, pkg.pickupCodeHash)) {
      await this.attempts.recordFailure(customerId, locker.id);
      throw new PackageNotFoundForRetrievalError();
    }

    const now = this.clock.now();
    const amountMinor = await this.feePolicy.calculate({
      size: pkg.size,
      storedAt: pkg.storedAt,
      retrievedAt: now,
    });

    const retrieved = pkg.retrieve({ now, storageFeeMinor: amountMinor });
    await this.packages.saveRetrieval(retrieved);
    // Only after the parcel is actually out. Losing the race to a concurrent
    // request throws from `saveRetrieval` and is not a failed attempt either —
    // nothing was guessed — so it neither counts nor clears.
    await this.attempts.clear(customerId, locker.id);

    // TODO(hardware): release the latch here — the one point where this
    // service would leave software and touch the locker bank, whether that is
    // an HTTP call to the station controller, an MQTT publish, or a vendor SDK:
    //
    //   await this.door.open({ lockerId: locker.id, lockerCode: locker.code });
    //
    // It sits after `saveRetrieval` on purpose: that write settles the race, so
    // only the one request that actually claimed the parcel can command a door.
    // The cost of that order is the gap this placeholder leaves open — if the
    // door failed, the parcel is already RETRIEVED and the fee charged, so a
    // real adapter needs a reconciliation path (a retry, or a status callback
    // from the board) rather than just a thrown error. `opened` is hardcoded
    // below until then; it is a claim about intent, not a confirmation.

    return {
      packageId: retrieved.id,
      lockerId: locker.id,
      lockerCode: locker.code,
      retrievedAt: retrieved.retrievedAt ?? now,
      storageFee: { amountMinor, currency: this.config.currency },
      opened: true,
    };
  }

}
