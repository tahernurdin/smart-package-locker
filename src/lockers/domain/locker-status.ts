export const LOCKER_STATUSES = ['IN_SERVICE', 'OUT_OF_SERVICE'] as const;
export type LockerStatus = (typeof LOCKER_STATUSES)[number];
