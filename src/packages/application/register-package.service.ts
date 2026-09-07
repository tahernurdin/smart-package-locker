import { Inject, Injectable } from '@nestjs/common';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../../customers/domain/customer.repository.js';
import { CustomerNotFoundError } from '../../customers/domain/errors.js';
import { LockerSize } from '../../lockers/domain/locker-size.js';
import { CLOCK, type Clock } from '../../shared/clock/clock.js';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id/id-generator.js';
import { Package } from '../domain/package.entity.js';
import type { PackageStatus } from '../domain/package-status.js';
import {
  PACKAGE_REPOSITORY,
  type PackageRepository,
} from '../domain/package.repository.js';

export interface RegisterPackageInput {
  size: string;
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
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async register(input: RegisterPackageInput): Promise<RegisteredPackage> {
    const size = LockerSize.of(input.size);

    const customer = await this.customers.findById(input.customerId);
    if (!customer) throw new CustomerNotFoundError(input.customerId);

    const pkg = Package.register({
      id: this.ids.next(),
      customerId: customer.id,
      size,
      trackingRef: input.trackingRef ?? null,
      now: this.clock.now(),
    });
    await this.packages.save(pkg);

    return { packageId: pkg.id, status: pkg.status };
  }
}
