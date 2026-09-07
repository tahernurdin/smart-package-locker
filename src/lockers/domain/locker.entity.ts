import { InvalidLockerCodeError } from './errors.js';
import type { LockerSize } from './locker-size.js';
import type { LockerStatus } from './locker-status.js';

export interface LockerProps {
  id: string;
  stationId: string;
  code: string;
  size: LockerSize;
  status: LockerStatus;
  createdAt: Date;
  updatedAt: Date;
}

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
    const code = params.code.trim();
    if (code.length === 0) throw new InvalidLockerCodeError();
    return new Locker({
      id: params.id,
      stationId: params.stationId,
      code,
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

  canFit(required: LockerSize): boolean {
    return this.size.fits(required);
  }
}
