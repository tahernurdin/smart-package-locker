/**
 * Whether a locker currently holds a package. Derived from the active
 * assignment, not stored on the locker — see `LockerOccupancy`.
 */
export const LOCKER_AVAILABILITIES = ['FREE', 'OCCUPIED'] as const;
export type LockerAvailability = (typeof LOCKER_AVAILABILITIES)[number];
