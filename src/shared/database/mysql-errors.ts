/** True when a query rejected with MySQL's duplicate-key error (errno 1062). */
export function isDuplicateEntryError(err: unknown): boolean {
  return hasCode(err, 'ER_DUP_ENTRY');
}

/**
 * The index name from a duplicate-key error, e.g.
 * `locker_assignment.uq_one_active_assignment_per_package`. Needed wherever one
 * insert can violate two keys that mean different things — ER_DUP_ENTRY alone
 * cannot tell a retryable clash from a terminal one.
 */
export function duplicateEntryKey(err: unknown): string | null {
  const message = (err as { message?: string } | null)?.message ?? '';
  return message.match(/for key '([^']+)'/)?.[1] ?? null;
}

/**
 * True when a query rejected because a foreign key had no referent
 * (errno 1216/1452) — an insert naming a parent row that doesn't exist.
 */
export function isMissingReferenceError(err: unknown): boolean {
  return (
    hasCode(err, 'ER_NO_REFERENCED_ROW') ||
    hasCode(err, 'ER_NO_REFERENCED_ROW_2')
  );
}

function hasCode(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === code
  );
}
