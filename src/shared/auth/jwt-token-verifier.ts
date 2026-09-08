import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser } from './auth-user.js';
import { isRole } from './roles.js';
import type { TokenVerifier } from './token-verifier.js';

/** The JWT-backed {@link TokenVerifier}: the only place that knows tokens are JWTs. */
@Injectable()
export class JwtTokenVerifier implements TokenVerifier {
  constructor(private readonly jwt: JwtService) {}

  async verify(rawToken: string): Promise<AuthUser | null> {
    let payload: { sub?: string; role?: unknown };
    try {
      payload = await this.jwt.verifyAsync(rawToken);
    } catch {
      return null;
    }

    // A signature we trust still doesn't mean a payload we can use.
    if (!payload.sub || !isRole(payload.role)) return null;

    return { sub: payload.sub, role: payload.role };
  }
}
