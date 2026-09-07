export const PACKAGE_STATUSES = ['REGISTERED', 'STORED', 'RETRIEVED'] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];
