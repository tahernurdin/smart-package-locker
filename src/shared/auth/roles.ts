export const Role = {
  Operator: 'OPERATOR',
  Agent: 'AGENT',
  Customer: 'CUSTOMER',
  /**
   * A locker station itself — the cabinet's keypad, not a person. It is the
   * caller of retrieval, because the customer standing at a locker has no
   * session: they prove who they are with the pickup code alone.
   */
  Station: 'STATION',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: readonly Role[] = Object.values(Role);

export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ALL_ROLES as readonly string[]).includes(value)
  );
}
