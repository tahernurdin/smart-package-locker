import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '../../shared/auth/roles.js';

/**
 * Mints a token for a role with no credential check whatsoever. Only ever
 * reachable while `AUTH_DEV_TOKENS` is on — see {@link DevTokenController}.
 */
@Injectable()
export class DevTokenService {
  constructor(private readonly jwt: JwtService) {}

  issue(role: Role, sub?: string): string {
    return this.jwt.sign({ role, sub: sub ?? `${role.toLowerCase()}-dev` });
  }
}
