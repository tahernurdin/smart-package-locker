import { JwtService } from '@nestjs/jwt';
import { JwtTokenVerifier } from './jwt-token-verifier.js';
import { Role } from './roles.js';

const jwt = new JwtService({ secret: 'test-secret' });
const verifier = new JwtTokenVerifier(jwt);

describe('JwtTokenVerifier', () => {
  it('rejects a garbage token', async () => {
    await expect(verifier.verify('nonsense')).resolves.toBeNull();
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = new JwtService({ secret: 'other-secret' }).sign({
      sub: 'agent-1',
      role: Role.Agent,
    });
    await expect(verifier.verify(forged)).resolves.toBeNull();
  });

  it('rejects a token whose role is unknown', async () => {
    const token = jwt.sign({ sub: 'x', role: 'SUPERADMIN' });
    await expect(verifier.verify(token)).resolves.toBeNull();
  });

  it('rejects a token with no subject', async () => {
    const token = jwt.sign({ role: Role.Agent });
    await expect(verifier.verify(token)).resolves.toBeNull();
  });

  it('returns the principal for a valid token', async () => {
    const token = jwt.sign({ sub: 'agent-1', role: Role.Agent });
    await expect(verifier.verify(token)).resolves.toEqual({
      sub: 'agent-1',
      role: 'AGENT',
    });
  });
});
