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

export interface SortSpec<TField extends string> {
  fields: readonly TField[];
  /** Applied field by field when the caller names neither. */
  fallback: Sort<TField>;
  /**
   * Builds the feature's own `ValidationDomainError` for a name off the
   * whitelist. Shared code never throws its own error type — the feature owns
   * the error code its clients see.
   */
  invalid: (param: string, value: string, allowed: readonly string[]) => Error;
}

/**
 * Narrow a requested sort against its spec. The query DTO's `@IsIn` binds only
 * callers that came through the HTTP pipe, so this re-checks rather than
 * trusting it: nothing unvetted may reach an `ORDER BY`.
 */
export function resolveSort<TField extends string>(
  spec: SortSpec<TField>,
  field?: string,
  direction?: string,
): Sort<TField> {
  return {
    field:
      field === undefined
        ? spec.fallback.field
        : narrow(spec.fields, 'sortBy', field, spec.invalid),
    direction:
      direction === undefined
        ? spec.fallback.direction
        : narrow(SORT_DIRECTIONS, 'sortDir', direction, spec.invalid),
  };
}

function narrow<T extends string>(
  allowed: readonly T[],
  param: string,
  value: string,
  invalid: SortSpec<string>['invalid'],
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw invalid(param, value, allowed);
  }
  return value as T;
}
