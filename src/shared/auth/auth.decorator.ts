import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import type { Role } from './roles.js';

/** Require a verified token in one of `roles` for the decorated route/controller. */
export function Auth(...roles: Role[]) {
  return applyDecorators(UseGuards(JwtAuthGuard, RolesGuard), Roles(roles));
}
