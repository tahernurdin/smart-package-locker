export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * A sort a client asked for. `TField` is a closed union per feature — the field
 * names a caller may use are a whitelist, never a column name off the wire.
 */
export interface Sort<TField extends string> {
  field: TField;
  direction: SortDirection;
}
