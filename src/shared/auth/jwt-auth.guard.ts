import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';
import { isRole } from './roles.js';

type AuthedRequest = Request & { user?: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: { sub?: string; role?: unknown };
    try {
      payload = await this.jwt.verifyAsync(header.slice('Bearer '.length));
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!payload.sub || !isRole(payload.role)) {
      throw new UnauthorizedException('Malformed token payload');
    }

    req.user = { sub: payload.sub, role: payload.role };
    return true;
  }
}
