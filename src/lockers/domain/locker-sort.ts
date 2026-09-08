import {
  resolveSort,
  type Sort,
  type SortSpec,
} from '../../shared/pagination/sort.js';
import { InvalidLockerSortError } from './errors.js';

/**
 * The fields `GET /lockers` may be ordered by. A closed set: the repository
 * maps each name to a SQL expression, so nothing off the wire reaches an
 * `ORDER BY`. Add a field here and give it an expression in the adapter.
 */
export const LOCKER_SORT_FIELDS = [
  'code',
  'size',
  'status',
  'availability',
  'station',
  'createdAt',
] as const;
export type LockerSortField = (typeof LOCKER_SORT_FIELDS)[number];

export type LockerSort = Sort<LockerSortField>;

/** Smallest first, as the list has always come back. */
export const DEFAULT_LOCKER_SORT: LockerSort = {
  field: 'size',
  direction: 'asc',
};

const SPEC: SortSpec<LockerSortField> = {
  fields: LOCKER_SORT_FIELDS,
  fallback: DEFAULT_LOCKER_SORT,
  invalid: (param, value, allowed) =>
    new InvalidLockerSortError(param, value, allowed),
};

export function lockerSortOf(field?: string, direction?: string): LockerSort {
  return resolveSort(SPEC, field, direction);
}
