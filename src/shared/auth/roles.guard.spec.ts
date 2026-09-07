import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { Role } from './roles.js';

function setup(user: unknown, required: Role[] | undefined) {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(required);
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector), context };
}

describe('RolesGuard', () => {
  it('allows when the route declares no roles', () => {
    const { guard, context } = setup({ sub: 'x', role: Role.Agent }, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a matching role', () => {
    const { guard, context } = setup({ sub: 'x', role: Role.Operator }, [
      Role.Operator,
    ]);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('forbids a mismatched role', () => {
    const { guard, context } = setup({ sub: 'x', role: Role.Agent }, [
      Role.Operator,
    ]);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('forbids an unauthenticated request', () => {
    const { guard, context } = setup(undefined, [Role.Operator]);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
