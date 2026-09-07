import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../shared/id/id-generator.js';
import {
  PICKUP_CODE_GENERATOR,
  type PickupCodeGenerator,
} from '../../shared/pickup-code/pickup-code-generator.js';
import { PickupCodeHasher } from '../../shared/pickup-code/pickup-code-hasher.js';
import {
  StationDecommissionedError,
  StationNotFoundError,
} from '../../stations/domain/errors.js';
import {
  STATION_REPOSITORY,
  type StationRepository,
} from '../../stations/domain/station.repository.js';
import {
  LockerJustTakenError,
  NoSuitableLockerError,
  PackageAlreadyStoredError,
  PackageNotFoundError,
} from '../domain/errors.js';
import type { PackageStatus } from '../domain/package-status.js';
import {
  PACKAGE_REPOSITORY,
  type PackageRepository,
} from '../domain/package.repository.js';

export interface StorePackageInput {
  packageId: string;
  agentId?: string;
  /** The station the agent is standing at. Allocation never crosses stations. */
  stationId: string;
}

export interface StoredPackage {
  packageId: string;
  lockerId: string;
  lockerCode: string;
  pickupCode: string;
  status: PackageStatus;
}

/** Retries cover a lost allocation race. */
const MAX_ATTEMPTS = 3;

@Injectable()
export class StorePackageService {
  constructor(
    @Inject(PACKAGE_REPOSITORY) private readonly packages: PackageRepository,
    @Inject(STATION_REPOSITORY) private readonly stations: StationRepository,
    @Inject(PICKUP_CODE_GENERATOR) private readonly codes: PickupCodeGenerator,
    private readonly hasher: PickupCodeHasher,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async store(input: StorePackageInput): Promise<StoredPackage> {
    const { stationId } = input;

    const pkg = await this.packages.findById(input.packageId);
    if (!pkg) throw new PackageNotFoundError(input.packageId);
    if (pkg.status !== 'REGISTERED') throw new PackageAlreadyStoredError();

    // Allocation filters on station_id, so an unknown station would simply match
    // no lockers and come back as `no_suitable_locker` — indistinguishable from a
    // station that is genuinely full. Answer the real question instead.
    const station = await this.stations.findById(stationId);
    if (!station) throw new StationNotFoundError(stationId);
    if (!station.isActive()) throw new StationDecommissionedError(stationId);

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
        if (err instanceof LockerJustTakenError && attempt < MAX_ATTEMPTS) {
          continue;
        }
        throw err;
      }
    }
  }
}
