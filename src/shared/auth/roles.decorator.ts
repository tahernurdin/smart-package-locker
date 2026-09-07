import { Reflector } from '@nestjs/core';
import type { Role } from './roles.js';

/** Attaches the roles allowed to call a handler; read by {@link RolesGuard}. */
export const Roles = Reflector.createDecorator<Role[]>();
