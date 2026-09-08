/**
 * Offset paging, shared by every list endpoint. Framework-free so domain ports
 * and application services can both speak it.
 */

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

/** A window over a result set. Always whole and in range — see `resolvePageRequest`. */
export interface PageRequest {
  limit: number;
  offset: number;
}

/** The envelope a paginated list endpoint answers with. */
export interface Page<T> {
  items: T[];
  /** Rows matching the filter, ignoring the window — not `items.length`. */
  total: number;
  limit: number;
  offset: number;
}

/**
 * Turn the raw `limit`/`offset` off a query string into a `PageRequest`.
 *
 * The DTO's `@Min`/`@Max` only bind callers that came through the HTTP pipe, so
 * this clamps again rather than trusting them: an out-of-range or unparseable
 * `limit` becomes the nearest legal one instead of an unbounded scan.
 */
export function resolvePageRequest(
  requested: Partial<PageRequest> = {},
): PageRequest {
  return {
    limit: Math.min(
      Math.max(whole(requested.limit, DEFAULT_PAGE_LIMIT), 1),
      MAX_PAGE_LIMIT,
    ),
    offset: Math.max(whole(requested.offset, 0), 0),
  };
}

export function toPage<T>(
  items: T[],
  total: number,
  page: PageRequest,
): Page<T> {
  return { items, total, limit: page.limit, offset: page.offset };
}

/** `NaN`/`Infinity` (a `?limit=abc` that skipped the pipe) falls back. */
function whole(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value as number) : fallback;
}
