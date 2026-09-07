/** True when a query rejected with MySQL's duplicate-key error (errno 1062). */
export function isDuplicateEntryError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}
