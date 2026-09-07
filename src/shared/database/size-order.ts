/**
 * SQL expression that orders sizes `SMALL < MEDIUM < LARGE`. Mirrors the
 * `LockerSize` value object (the source of truth) — only queries that need sizes
 * ordered use this, which is why it's a fragment here rather than a table.
 */
export function sizeOrderExpr(operand: string): string {
  return `FIELD(${operand}, 'SMALL', 'MEDIUM', 'LARGE')`;
}
