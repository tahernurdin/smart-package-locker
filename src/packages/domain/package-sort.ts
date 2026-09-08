import {
  resolveSort,
  type Sort,
  type SortSpec,
} from '../../shared/pagination/sort.js';
import { InvalidPackageSortError } from './errors.js';

/**
 * The fields a package listing may be ordered by. A closed set: the repository
 * maps each name to a SQL expression, so nothing off the wire reaches an
 * `ORDER BY`. Add a field here and give it an expression in the adapter.
 */
export const PACKAGE_SORT_FIELDS = [
  'registeredAt',
  'storedAt',
  'retrievedAt',
  'status',
  'size',
  'station',
] as const;
export type PackageSortField = (typeof PACKAGE_SORT_FIELDS)[number];

export type PackageSort = Sort<PackageSortField>;

/**
 * Newest first. Both listings are "what happened lately" screens, and it is the
 * order `ix_package_customer (customer_id, created_at)` already stores.
 */
export const DEFAULT_PACKAGE_SORT: PackageSort = {
  field: 'registeredAt',
  direction: 'desc',
};

const SPEC: SortSpec<PackageSortField> = {
  fields: PACKAGE_SORT_FIELDS,
  fallback: DEFAULT_PACKAGE_SORT,
  invalid: (param, value, allowed) =>
    new InvalidPackageSortError(param, value, allowed),
};

export function packageSortOf(field?: string, direction?: string): PackageSort {
  return resolveSort(SPEC, field, direction);
}
