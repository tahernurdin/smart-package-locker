import type { LockerSizeCode } from '../domain/locker-size.js';
import type { LockerStatus } from '../domain/locker-status.js';
import type { Locker } from '../domain/locker.entity.js';
import type {
  LockerOccupancy,
  LockerStationSummary,
} from '../domain/locker.repository.js';

/** The single row shape every `/lockers` endpoint answers with. */
export interface LockerView {
  id: string;
  code: string;
  size: LockerSizeCode;
  status: LockerStatus;
  availability: 'FREE' | 'OCCUPIED';
  activePackageId: string | null;
  stationId: string;
  stationName: string;
  location: string | null;
}

export function toLockerView({
  locker,
  activePackageId,
  station,
}: LockerOccupancy): LockerView {
  return {
    id: locker.id,
    code: locker.code,
    size: locker.size.code,
    status: locker.status,
    availability: activePackageId ? 'OCCUPIED' : 'FREE',
    activePackageId,
    stationId: station.id,
    stationName: station.name,
    location: station.location,
  };
}

/** Same view for a locker just written, whose occupancy the caller already knows. */
export function toLockerViewAt(
  locker: Locker,
  station: LockerStationSummary,
  activePackageId: string | null,
): LockerView {
  return toLockerView({ locker, station, activePackageId });
}
