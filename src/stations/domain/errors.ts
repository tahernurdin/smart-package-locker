import {
  ConflictDomainError,
  NotFoundDomainError,
  ValidationDomainError,
} from '../../shared/errors/domain-error.js';

export class InvalidStationNameError extends ValidationDomainError {
  constructor() {
    super('invalid_station_name', 'Station name must not be empty');
  }
}

export class StationNotFoundError extends NotFoundDomainError {
  constructor(id: string) {
    super('station_not_found', `No station with id ${id}`, { id });
  }
}

/**
 * Raised when an operation needs a live station: adding a locker to a retired
 * site, or retiring one twice. Decommissioning is terminal.
 */
export class StationDecommissionedError extends ConflictDomainError {
  constructor(id: string) {
    super('station_decommissioned', `Station ${id} is decommissioned`, { id });
  }
}

/**
 * A station can only be retired once its lockers are. Decommissioning it while
 * lockers still stand there would strand them: they'd remain allocatable at a
 * site that no longer exists.
 */
export class StationNotEmptyError extends ConflictDomainError {
  constructor(id: string, lockerCount: number) {
    super(
      'station_not_empty',
      `Station ${id} still has ${lockerCount} locker(s); decommission them first`,
      { id, lockerCount },
    );
  }
}
