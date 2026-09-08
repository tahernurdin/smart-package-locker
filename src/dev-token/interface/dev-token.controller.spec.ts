import { NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../shared/auth/roles.js';
import type { AppConfiguration } from '../../shared/config/configuration.js';
import { DevTokenService } from '../application/dev-token.service.js';
import { DevTokenController } from './dev-token.controller.js';

const jwt = new JwtService({ secret: 'test-secret' });
const service = new DevTokenService(jwt);

function controllerWithDevTokens(authDevTokens: boolean) {
  return new DevTokenController(service, { authDevTokens } as AppConfiguration);
}

describe('dev tokens', () => {
  it('issues a token that decodes to the requested role', () => {
    const { token, role } = controllerWithDevTokens(true).issue({
      role: Role.Customer,
    });

    expect(role).toBe('CUSTOMER');
    expect(jwt.verify(token)).toMatchObject({
      role: 'CUSTOMER',
      sub: 'customer-dev',
    });
  });

  it('honours an explicit subject', () => {
    const { token } = controllerWithDevTokens(true).issue({
      role: Role.Agent,
      sub: 'agent-42',
    });

    expect(jwt.verify(token)).toMatchObject({ role: 'AGENT', sub: 'agent-42' });
  });

  it('404s when AUTH_DEV_TOKENS is disabled', () => {
    expect(() =>
      controllerWithDevTokens(false).issue({ role: Role.Operator }),
    ).toThrow(NotFoundException);
  });
});
