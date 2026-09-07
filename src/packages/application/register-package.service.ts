import { Inject, Injectable } from '@nestjs/common';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../../shared/id/id-generator.js';
import { Package } from '../domain/package.entity.js';
import type { PackageStatus } from '../domain/package-status.js';
import {
  PACKAGE_REPOSITORY,
  type PackageRepository,
} from '../domain/package.repository.js';

export interface RegisterPackageInput {
  size: string;
  /**
   * Opaque reference to a customer owned by an upstream customer service. This
   * system stores it and never resolves it — creating, updating and notifying
   * customers (incl. delivering the pickup code) are out of scope per the brief.
   */
  customerId: string;
  trackingRef?: string;
}

export interface RegisteredPackage {
  packageId: string;
  status: PackageStatus;
}

@Injectable()
export class RegisterPackageService {
  constructor(
    @Inject(PACKAGE_REPOSITORY) private readonly packages: PackageRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async register(input: RegisterPackageInput): Promise<RegisteredPackage> {
    const size = LockerSize.of(input.size);

    const pkg = Package.register({
      id: this.ids.next(),
      customerId: input.customerId,
      size,
      trackingRef: input.trackingRef ?? null,
      now: this.clock.now(),
    });
    await this.packages.save(pkg);

    return { packageId: pkg.id, status: pkg.status };
  }
}
