export interface LockerAssignmentProps {
  id: string;
  lockerId: string;
  pickupCodeHash: string;
  storedByAgent: string | null;
  storedAt: Date;
  retrievedAt: Date | null;
  storageFeeMinor: number | null;
}

/**
 * One storage episode: a package occupying a locker, bracketed by `storedAt` and
 * `retrievedAt`. A child entity of the `Package` aggregate. Immutable.
 */
export class LockerAssignment {
  readonly id: string;
  readonly lockerId: string;
  readonly pickupCodeHash: string;
  readonly storedByAgent: string | null;
  readonly storedAt: Date;
  readonly retrievedAt: Date | null;
  readonly storageFeeMinor: number | null;

  private constructor(props: LockerAssignmentProps) {
    this.id = props.id;
    this.lockerId = props.lockerId;
    this.pickupCodeHash = props.pickupCodeHash;
    this.storedByAgent = props.storedByAgent;
    this.storedAt = props.storedAt;
    this.retrievedAt = props.retrievedAt;
    this.storageFeeMinor = props.storageFeeMinor;
  }

  static open(params: {
    id: string;
    lockerId: string;
    pickupCodeHash: string;
    storedByAgent: string | null;
    now: Date;
  }): LockerAssignment {
    return new LockerAssignment({
      id: params.id,
      lockerId: params.lockerId,
      pickupCodeHash: params.pickupCodeHash,
      storedByAgent: params.storedByAgent,
      storedAt: params.now,
      retrievedAt: null,
      storageFeeMinor: null,
    });
  }

  static fromPersistence(props: LockerAssignmentProps): LockerAssignment {
    return new LockerAssignment(props);
  }

  get isActive(): boolean {
    return this.retrievedAt === null;
  }

  /**
   * Returns a closed copy. `retrievedAt` is clamped to `storedAt` so a frozen
   * test clock behind `storedAt` can't violate the `retrieved_at >= stored_at`
   * DB constraint.
   */
  close(params: { now: Date; storageFeeMinor: number }): LockerAssignment {
    const retrievedAt =
      params.now.getTime() < this.storedAt.getTime() ? this.storedAt : params.now;
    return new LockerAssignment({
      id: this.id,
      lockerId: this.lockerId,
      pickupCodeHash: this.pickupCodeHash,
      storedByAgent: this.storedByAgent,
      storedAt: this.storedAt,
      retrievedAt,
      storageFeeMinor: params.storageFeeMinor,
    });
  }
}
