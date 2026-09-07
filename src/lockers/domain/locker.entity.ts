import { InvalidLockerCodeError, LockerDecommissionedError } from './errors.js';
import type { LockerSize } from './locker-size.js';
import type { LiveLockerStatus, LockerStatus } from './locker-status.js';

export interface LockerProps {
  id: string;
  stationId: string;
  code: string;
  size: LockerSize;
  status: LockerStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A physical box at a station. Immutable — transitions return a new instance.
 *
 * `size` and `stationId` are fixed for life: they describe the hardware and
 * where it is bolted. A box that changed size would invalidate the allocation
 * already made for whatever is inside it, so the operator retires it and
 * creates its replacement.
 */
export class Locker {
  readonly id: string;
  readonly stationId: string;
  readonly code: string;
  readonly size: LockerSize;
  readonly status: LockerStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: LockerProps) {
    this.id = props.id;
    this.stationId = props.stationId;
    this.code = props.code;
    this.size = props.size;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(params: {
    id: string;
    stationId: string;
    code: string;
    size: LockerSize;
    now: Date;
  }): Locker {
    return new Locker({
      id: params.id,
      stationId: params.stationId,
      code: requireCode(params.code),
      size: params.size,
      status: 'IN_SERVICE',
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  static fromPersistence(props: LockerProps): Locker {
    return new Locker(props);
  }

  isServiceable(): boolean {
    return this.status === 'IN_SERVICE';
  }

  isDecommissioned(): boolean {
    return this.status === 'DECOMMISSIONED';
  }

  canFit(required: LockerSize): boolean {
    return this.size.fits(required);
  }

  /**
   * Relabel and/or take in or out of service. Uniqueness of `(station, code)`
   * is the repository's to enforce; omitting a field keeps it.
   */
  update(params: {
    code?: string;
    status?: LiveLockerStatus;
    now: Date;
  }): Locker {
    this.requireLive();
    return new Locker({
      ...this,
      code: params.code === undefined ? this.code : requireCode(params.code),
      status: params.status ?? this.status,
      updatedAt: params.now,
    });
  }

  /** → DECOMMISSIONED. Terminal: a retired locker never returns to service. */
  decommission(now: Date): Locker {
    this.requireLive();
    return new Locker({ ...this, status: 'DECOMMISSIONED', updatedAt: now });
  }

  private requireLive(): void {
    if (this.isDecommissioned()) throw new LockerDecommissionedError(this.id);
  }
}

function requireCode(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length === 0) throw new InvalidLockerCodeError();
  return trimmed;
}
