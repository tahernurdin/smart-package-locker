import { Inject, Injectable } from '@nestjs/common';
import { FindOrCreateCustomerService } from '../../customers/application/find-or-create-customer.service.js';
import { DEFAULT_STATION_ID } from '../../lockers/application/create-locker.service.js';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import {
  LOCKER_REPOSITORY,
  type LockerRepository,
} from '../../lockers/domain/locker.repository.js';
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
  PickupCodeCollisionError,
} from '../domain/errors.js';
import { Package } from '../domain/package.entity.js';
import {
  PACKAGE_REPOSITORY,
  type PackageRepository,
} from '../domain/package.repository.js';

export interface StorePackageInput {
  size: string;
  customer: { name: string; email?: string; phone?: string };
  trackingRef?: string;
  agentId?: string;
  stationId?: string;
}

export interface StoredPackage {
  packageId: string;
  lockerId: string;
  lockerCode: string;
  pickupCode: string;
}

const MAX_PICKUP_CODE_ATTEMPTS = 5;

@Injectable()
export class StorePackageService {
  constructor(
    @Inject(LOCKER_REPOSITORY) private readonly lockers: LockerRepository,
    @Inject(PACKAGE_REPOSITORY) private readonly packages: PackageRepository,
    private readonly customers: FindOrCreateCustomerService,
    @Inject(PICKUP_CODE_GENERATOR) private readonly codes: PickupCodeGenerator,
    private readonly hasher: PickupCodeHasher,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async storePackage(input: StorePackageInput): Promise<StoredPackage> {
    const size = LockerSize.of(input.size);
    const stationId = input.stationId ?? DEFAULT_STATION_ID;

    // Fail fast, before creating a customer, when nothing fits.
    const locker = await this.lockers.findAvailableSmallestFit(stationId, size);
    if (!locker) throw new NoSuitableLockerError(size.code);

    const customer = await this.customers.findOrCreate(input.customer);

    for (let attempt = 1; ; attempt++) {
      const pickupCode = this.codes.generate();
      const pkg = Package.storeNew({
        id: this.ids.next(),
        lockerId: locker.id,
        customerId: customer.id,
        size,
        pickupCodeHash: this.hasher.hash(pickupCode),
        trackingRef: input.trackingRef ?? null,
        storedByAgent: input.agentId ?? null,
        now: this.clock.now(),
      });

      try {
        await this.packages.save(pkg);
        return {
          packageId: pkg.id,
          lockerId: locker.id,
          lockerCode: locker.code,
          pickupCode,
        };
      } catch (err) {
        if (
          err instanceof PickupCodeCollisionError &&
          attempt < MAX_PICKUP_CODE_ATTEMPTS
        ) {
          continue;
        }
        if (err instanceof LockerJustTakenError) {
          // TODO(L4): re-run allocation with FOR UPDATE SKIP LOCKED + bounded retry.
          throw new NoSuitableLockerError(size.code);
        }
        throw err;
      }
    }
  }
}
