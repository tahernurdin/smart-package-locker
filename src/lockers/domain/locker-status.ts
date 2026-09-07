export const LOCKER_STATUSES = [
  'IN_SERVICE',
  'OUT_OF_SERVICE',
  'DECOMMISSIONED',
] as const;
export type LockerStatus = (typeof LOCKER_STATUSES)[number];

/**
 * The statuses a standing locker can be moved between. DECOMMISSIONED is
 * excluded because it is terminal and reached only through
 * `DELETE /lockers/:id`, never through a status edit.
 */
export const LIVE_LOCKER_STATUSES = ['IN_SERVICE', 'OUT_OF_SERVICE'] as const;
export type LiveLockerStatus = (typeof LIVE_LOCKER_STATUSES)[number];
