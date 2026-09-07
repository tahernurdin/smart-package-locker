import {
  InvalidStationNameError,
  StationDecommissionedError,
} from './errors.js';
import type { StationStatus } from './station-status.js';

export interface LockerStationProps {
  id: string;
  name: string;
  location: string | null;
  status: StationStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A site holding a bank of lockers. Immutable — transitions return a new
 * instance, matching `Package` / `Locker`.
 *
 * `name` is a label, not an identity: two stations may share one. The id is the
 * identity, so nothing here enforces uniqueness.
 */
export class LockerStation {
  readonly id: string;
  readonly name: string;
  readonly location: string | null;
  readonly status: StationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: LockerStationProps) {
    this.id = props.id;
    this.name = props.name;
    this.location = props.location;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(params: {
    id: string;
    name: string;
    location?: string | null;
    now: Date;
  }): LockerStation {
    return new LockerStation({
      id: params.id,
      name: requireName(params.name),
      location: normalizeLocation(params.location),
      status: 'ACTIVE',
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  static fromPersistence(props: LockerStationProps): LockerStation {
    return new LockerStation(props);
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  /** Rename / relocate. Both fields are descriptive; omitting one keeps it. */
  update(params: {
    name?: string;
    location?: string | null;
    now: Date;
  }): LockerStation {
    this.requireActive();
    return new LockerStation({
      ...this,
      name: params.name === undefined ? this.name : requireName(params.name),
      location:
        params.location === undefined
          ? this.location
          : normalizeLocation(params.location),
      updatedAt: params.now,
    });
  }

  /** ACTIVE → DECOMMISSIONED. Terminal: a retired station never reopens. */
  decommission(now: Date): LockerStation {
    this.requireActive();
    return new LockerStation({
      ...this,
      status: 'DECOMMISSIONED',
      updatedAt: now,
    });
  }

  private requireActive(): void {
    if (!this.isActive()) throw new StationDecommissionedError(this.id);
  }
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new InvalidStationNameError();
  return trimmed;
}

function normalizeLocation(location: string | null | undefined): string | null {
  const trimmed = location?.trim();
  return trimmed ? trimmed : null;
}
