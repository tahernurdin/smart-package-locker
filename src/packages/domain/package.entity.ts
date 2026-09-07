// `LockerSize` is the shared size value object (a package's size is expressed in
// the same terms as a locker's). It lives in the lockers domain, which acts as
// the shared kernel for this concept.
import type { LockerSize } from '../../lockers/domain/locker-size.js';

export interface PackageProps {
  id: string;
  lockerId: string;
  customerId: string;
  size: LockerSize;
  pickupCodeHash: string;
  trackingRef: string | null;
  storedByAgent: string | null;
  storedAt: Date;
  retrievedAt: Date | null;
  storageFeeMinor: number | null;
}

/** One occupancy episode: a package in a locker, bracketed by stored/retrieved. */
export class Package {
  readonly id: string;
  readonly lockerId: string;
  readonly customerId: string;
  readonly size: LockerSize;
  readonly pickupCodeHash: string;
  readonly trackingRef: string | null;
  readonly storedByAgent: string | null;
  readonly storedAt: Date;
  readonly retrievedAt: Date | null;
  readonly storageFeeMinor: number | null;

  private constructor(props: PackageProps) {
    this.id = props.id;
    this.lockerId = props.lockerId;
    this.customerId = props.customerId;
    this.size = props.size;
    this.pickupCodeHash = props.pickupCodeHash;
    this.trackingRef = props.trackingRef;
    this.storedByAgent = props.storedByAgent;
    this.storedAt = props.storedAt;
    this.retrievedAt = props.retrievedAt;
    this.storageFeeMinor = props.storageFeeMinor;
  }

  static storeNew(params: {
    id: string;
    lockerId: string;
    customerId: string;
    size: LockerSize;
    pickupCodeHash: string;
    trackingRef?: string | null;
    storedByAgent?: string | null;
    now: Date;
  }): Package {
    return new Package({
      id: params.id,
      lockerId: params.lockerId,
      customerId: params.customerId,
      size: params.size,
      pickupCodeHash: params.pickupCodeHash,
      trackingRef: params.trackingRef ?? null,
      storedByAgent: params.storedByAgent ?? null,
      storedAt: params.now,
      retrievedAt: null,
      storageFeeMinor: null,
    });
  }

  static fromPersistence(props: PackageProps): Package {
    return new Package(props);
  }

  get isActive(): boolean {
    return this.retrievedAt === null;
  }
}
