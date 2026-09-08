import type { AuthUser } from './auth-user.js';

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');

/**
 * Turns a raw bearer token into the principal it names, or null when the token
 * cannot be trusted for any reason — bad signature, expired, or a payload that
 * doesn't describe a principal. Callers get no detail beyond that on purpose:
 * telling an unauthenticated caller *why* their token failed leaks more than it
 * helps. Knows nothing about requests or status codes; the guard owns that.
 */
export interface TokenVerifier {
  verify(rawToken: string): Promise<AuthUser | null>;
}
