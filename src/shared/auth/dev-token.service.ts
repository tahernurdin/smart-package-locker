import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from './roles.js';

@Injectable()
export class DevTokenService {
  constructor(private readonly jwt: JwtService) {}

  issue(role: Role, sub?: string): string {
    return this.jwt.sign({ role, sub: sub ?? `${role.toLowerCase()}-dev` });
  }
}
