export const Role = {
  Operator: 'OPERATOR',
  Agent: 'AGENT',
  Customer: 'CUSTOMER',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const ALL_ROLES: readonly Role[] = Object.values(Role);

export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ALL_ROLES as readonly string[]).includes(value)
  );
}
