import {
  SORT_DIRECTIONS,
  type Sort,
  type SortDirection,
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

/**
 * Narrow a requested sort, falling back to the default field by field. The
 * query DTO's `@IsIn` binds only HTTP callers, so this re-checks rather than
 * trusting it.
 */
export function lockerSortOf(field?: string, direction?: string): LockerSort {
  return {
    field:
      field === undefined ? DEFAULT_LOCKER_SORT.field : requireField(field),
    direction:
      direction === undefined
        ? DEFAULT_LOCKER_SORT.direction
        : requireDirection(direction),
  };
}

function requireField(field: string): LockerSortField {
  if (!(LOCKER_SORT_FIELDS as readonly string[]).includes(field)) {
    throw new InvalidLockerSortError('sortBy', field, LOCKER_SORT_FIELDS);
  }
  return field as LockerSortField;
}

function requireDirection(direction: string): SortDirection {
  if (!(SORT_DIRECTIONS as readonly string[]).includes(direction)) {
    throw new InvalidLockerSortError('sortDir', direction, SORT_DIRECTIONS);
  }
  return direction as SortDirection;
}
