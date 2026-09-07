import type { Role } from './roles.js';

/** What the guards attach to the request after verifying a bearer token. */
export interface AuthUser {
  sub: string;
  role: Role;
}
