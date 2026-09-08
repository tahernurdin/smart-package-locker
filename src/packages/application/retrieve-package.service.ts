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
import { PackageNotFoundForRetrievalError } from '../domain/errors.js';
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
  ) {}

  async retrieve(
    customerId: string,
    input: RetrievePackageDto,
  ): Promise<RetrievedPackage> {
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

    if (!this.hasher.verify(pickupCode, pkg.pickupCodeHash)) {
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
