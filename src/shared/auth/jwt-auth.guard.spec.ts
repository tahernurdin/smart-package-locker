import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Role } from './roles.js';

const jwt = new JwtService({ secret: 'test-secret' });
const guard = new JwtAuthGuard(jwt);

function contextFor(authHeader?: string) {
  const req: { headers: Record<string, string>; user?: unknown } = {
    headers: authHeader ? { authorization: authHeader } : {},
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
  return { context, req };
}

describe('JwtAuthGuard', () => {
  it('rejects a missing token', async () => {
    await expect(guard.canActivate(contextFor().context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a garbage token', async () => {
    await expect(
      guard.canActivate(contextFor('Bearer nonsense').context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token whose role is unknown', async () => {
    const token = jwt.sign({ sub: 'x', role: 'SUPERADMIN' });
    await expect(
      guard.canActivate(contextFor(`Bearer ${token}`).context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid token and attaches the user', async () => {
    const token = jwt.sign({ sub: 'agent-1', role: Role.Agent });
    const { context, req } = contextFor(`Bearer ${token}`);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({ sub: 'agent-1', role: 'AGENT' });
  });
});
