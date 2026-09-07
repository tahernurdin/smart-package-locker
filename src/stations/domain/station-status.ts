export const STATION_STATUSES = ['ACTIVE', 'DECOMMISSIONED'] as const;
export type StationStatus = (typeof STATION_STATUSES)[number];
