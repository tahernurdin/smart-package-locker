/** True when a query rejected with MySQL's duplicate-key error (errno 1062). */
export function isDuplicateEntryError(err: unknown): boolean {
  return hasCode(err, 'ER_DUP_ENTRY');
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
