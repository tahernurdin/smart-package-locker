import { Inject, Injectable } from '@nestjs/common';
import { DEFAULT_STATION_ID } from '../../lockers/application/create-locker.service.js';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id/id-generator.js';
import {
  PICKUP_CODE_GENERATOR,
  type PickupCodeGenerator,
} from '../../shared/pickup-code/pickup-code-generator.js';
import { PickupCodeHasher } from '../../shared/pickup-code/pickup-code-hasher.js';
import {
  LockerJustTakenError,
  NoSuitableLockerError,
  PackageAlreadyStoredError,
  PackageNotFoundError,
  PickupCodeCollisionError,
} from '../domain/errors.js';
import type { PackageStatus } from '../domain/package-status.js';
import {
  PACKAGE_REPOSITORY,
  type PackageRepository,
} from '../domain/package.repository.js';

export interface StorePackageInput {
  packageId: string;
  agentId?: string;
  stationId?: string;
}

export interface StoredPackage {
  packageId: string;
  lockerId: string;
  lockerCode: string;
  pickupCode: string;
  status: PackageStatus;
}

/** Retries cover a lost allocation race / a pickup-code collision. */
const MAX_ATTEMPTS = 3;

@Injectable()
export class StorePackageService {
  constructor(
    @Inject(PACKAGE_REPOSITORY) private readonly packages: PackageRepository,
    @Inject(PICKUP_CODE_GENERATOR) private readonly codes: PickupCodeGenerator,
    private readonly hasher: PickupCodeHasher,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async store(input: StorePackageInput): Promise<StoredPackage> {
    const stationId = input.stationId ?? DEFAULT_STATION_ID;

    const pkg = await this.packages.findById(input.packageId);
    if (!pkg) throw new PackageNotFoundError(input.packageId);
    if (pkg.status !== 'REGISTERED') throw new PackageAlreadyStoredError();

    for (let attempt = 1; ; attempt++) {
      const now = this.clock.now();
      const pickupCode = this.codes.generate();

      try {
        const reserved = await this.packages.reserveLockerAndStore({
          packageId: pkg.id,
          stationId,
          requiredSize: pkg.size,
          storedAt: now,
          build: (lockerId) =>
            pkg.storeInLocker({
              assignmentId: this.ids.next(),
              lockerId,
              pickupCodeHash: this.hasher.hash(pickupCode),
              storedByAgent: input.agentId ?? null,
              now,
            }),
        });

        if (!reserved) throw new NoSuitableLockerError(pkg.size.code);

        return {
          packageId: pkg.id,
          lockerId: reserved.lockerId,
          lockerCode: reserved.lockerCode,
          pickupCode,
          status: 'STORED',
        };
      } catch (err) {
        if (
          (err instanceof PickupCodeCollisionError ||
            err instanceof LockerJustTakenError) &&
          attempt < MAX_ATTEMPTS
        ) {
          continue;
        }
        throw err;
      }
    }
  }
}
