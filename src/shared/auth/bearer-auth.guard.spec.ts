import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';
import { BearerAuthGuard } from './bearer-auth.guard.js';
import { Role } from './roles.js';
import type { TokenVerifier } from './token-verifier.js';

const AGENT: AuthUser = { sub: 'agent-1', role: Role.Agent };

/** Trusts one token and nothing else, so the guard is tested without any JWT. */
class FakeTokenVerifier implements TokenVerifier {
  verify(rawToken: string): Promise<AuthUser | null> {
    return Promise.resolve(rawToken === 'good-token' ? AGENT : null);
  }
}

const guard = new BearerAuthGuard(new FakeTokenVerifier());

function contextFor(authHeader?: string) {
  const req: { headers: Record<string, string>; user?: unknown } = {
    headers: authHeader ? { authorization: authHeader } : {},
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
  return { context, req };
}

describe('BearerAuthGuard', () => {
  it('rejects a missing token', async () => {
    await expect(guard.canActivate(contextFor().context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a header without the Bearer scheme', async () => {
    await expect(
      guard.canActivate(contextFor('Basic good-token').context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token the verifier does not trust', async () => {
    await expect(
      guard.canActivate(contextFor('Bearer nonsense').context),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a trusted token and attaches the user', async () => {
    const { context, req } = contextFor('Bearer good-token');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({ sub: 'agent-1', role: 'AGENT' });
  });
});
