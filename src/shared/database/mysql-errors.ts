/** True when a query rejected with MySQL's duplicate-key error (errno 1062). */
export function isDuplicateEntryError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'ER_DUP_ENTRY'
  );
}

/** The index name from a duplicate-key error message, e.g. `package.uq_active_pickup_code`. */
export function duplicateEntryKey(err: unknown): string | null {
  const message = (err as { message?: string } | null)?.message ?? '';
  return message.match(/for key '([^']+)'/)?.[1] ?? null;
}
