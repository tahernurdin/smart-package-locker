// `LockerSize` is the shared size value object (a package's size is expressed in
// the same terms as a locker's). It lives in the lockers domain, which acts as
// the shared kernel for this concept.
import type { LockerSize } from '../../lockers/domain/locker-size.js';
import {
  PackageAlreadyRetrievedError,
  PackageAlreadyStoredError,
} from './errors.js';
import { LockerAssignment } from './locker-assignment.entity.js';
import type { PackageStatus } from './package-status.js';

export interface PackageProps {
  id: string;
  customerId: string;
  size: LockerSize;
  trackingRef: string | null;
  status: PackageStatus;
  createdAt: Date;
  updatedAt: Date;
  assignment: LockerAssignment | null;
}

/**
 * The parcel. Registered against a `customerId` (an opaque reference owned by an
 * upstream customer service), then dropped by an agent (`storeInLocker`), then
 * collected (`retrieve`). Aggregate root; owns its current `LockerAssignment`.
 * Immutable — transitions return a new instance.
 */
export class Package {
  readonly id: string;
  readonly customerId: string;
  readonly size: LockerSize;
  readonly trackingRef: string | null;
  readonly status: PackageStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly assignment: LockerAssignment | null;

  private constructor(props: PackageProps) {
    this.id = props.id;
    this.customerId = props.customerId;
    this.size = props.size;
    this.trackingRef = props.trackingRef;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.assignment = props.assignment;
  }

  static register(params: {
    id: string;
    customerId: string;
    size: LockerSize;
    trackingRef?: string | null;
    now: Date;
  }): Package {
    return new Package({
      id: params.id,
      customerId: params.customerId,
      size: params.size,
      trackingRef: params.trackingRef ?? null,
      status: 'REGISTERED',
      createdAt: params.now,
      updatedAt: params.now,
      assignment: null,
    });
  }

  static fromPersistence(props: PackageProps): Package {
    return new Package(props);
  }

  private requireAssignment(): LockerAssignment {
    if (!this.assignment) throw new Error('package has no locker assignment');
    return this.assignment;
  }

  get lockerId(): string {
    return this.requireAssignment().lockerId;
  }

  get pickupCodeHash(): string {
    return this.requireAssignment().pickupCodeHash;
  }

  get storedAt(): Date {
    return this.requireAssignment().storedAt;
  }

  get retrievedAt(): Date | null {
    return this.assignment?.retrievedAt ?? null;
  }

  /** REGISTERED → STORED. Opens a fresh assignment for `lockerId`. */
  storeInLocker(params: {
    assignmentId: string;
    lockerId: string;
    pickupCodeHash: string;
    storedByAgent?: string | null;
    now: Date;
  }): Package {
    if (this.status !== 'REGISTERED') throw new PackageAlreadyStoredError();
    const assignment = LockerAssignment.open({
      id: params.assignmentId,
      lockerId: params.lockerId,
      pickupCodeHash: params.pickupCodeHash,
      storedByAgent: params.storedByAgent ?? null,
      now: params.now,
    });
    return new Package({
      id: this.id,
      customerId: this.customerId,
      size: this.size,
      trackingRef: this.trackingRef,
      status: 'STORED',
      createdAt: this.createdAt,
      updatedAt: params.now,
      assignment,
    });
  }

  /**
   * Replaces the pickup code on the open assignment. Not a status change: the
   * parcel stays STORED in the same locker, and only the secret that opens it
   * changes — which is what makes the old code worthless the moment this
   * returns.
   */
  reissuePickupCode(params: { pickupCodeHash: string; now: Date }): Package {
    if (this.status !== 'STORED' || !this.assignment?.isActive) {
      throw new PackageAlreadyRetrievedError();
    }
    return new Package({
      id: this.id,
      customerId: this.customerId,
      size: this.size,
      trackingRef: this.trackingRef,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: params.now,
      assignment: this.assignment.withPickupCodeHash(params.pickupCodeHash),
    });
  }

  /** STORED → RETRIEVED. Closes the assignment with the computed fee. */
  retrieve(params: { now: Date; storageFeeMinor: number }): Package {
    if (this.status !== 'STORED' || !this.assignment?.isActive) {
      throw new PackageAlreadyRetrievedError();
    }
    return new Package({
      id: this.id,
      customerId: this.customerId,
      size: this.size,
      trackingRef: this.trackingRef,
      status: 'RETRIEVED',
      createdAt: this.createdAt,
      updatedAt: params.now,
      assignment: this.assignment.close({
        now: params.now,
        storageFeeMinor: params.storageFeeMinor,
      }),
    });
  }
}
