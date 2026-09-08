import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';
import { TOKEN_VERIFIER, type TokenVerifier } from './token-verifier.js';

const BEARER = 'Bearer ';

type AuthedRequest = Request & { user?: AuthUser };

/**
 * Pulls a bearer token off the request, hands it to a {@link TokenVerifier},
 * and attaches the resulting principal. Knows the header format and the
 * principal shape — nothing about how tokens are signed or where users live.
 */
@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(@Inject(TOKEN_VERIFIER) private readonly tokens: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith(BEARER)) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const user = await this.tokens.verify(header.slice(BEARER.length));
    if (!user) throw new UnauthorizedException('Invalid token');

    req.user = user;
    return true;
  }
}
