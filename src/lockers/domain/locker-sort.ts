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
 *
 * Only high-cardinality fields are offered. `size` (3 values), `status` (3) and
 * `availability` (2) are deliberately *not* sortable: ordering by a field with
 * a handful of values is a grouping, and paging through it is useless — every
 * page but the boundary ones holds a single value. All three are filters
 * instead, which is what answers the question the caller actually has.
 */
export const LOCKER_SORT_FIELDS = ['code', 'station', 'createdAt'] as const;
export type LockerSortField = (typeof LOCKER_SORT_FIELDS)[number];

export type LockerSort = Sort<LockerSortField>;

/**
 * By code, the locker's human identifier — the order an operator reads a bank
 * in. `ix_locker_code (code, id)` stores exactly this, so the default listing
 * is answered by an index walk rather than sorting the table.
 */
export const DEFAULT_LOCKER_SORT: LockerSort = {
  field: 'code',
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
