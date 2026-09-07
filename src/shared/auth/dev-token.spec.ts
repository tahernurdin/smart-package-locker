import { NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AppConfiguration } from '../config/configuration.js';
import { DevTokenController } from './dev-token.controller.js';
import { DevTokenService } from './dev-token.service.js';
import { Role } from './roles.js';

const jwt = new JwtService({ secret: 'test-secret' });
const service = new DevTokenService(jwt);

describe('dev tokens', () => {
  it('issues a token that decodes to the requested role', () => {
    const ctrl = new DevTokenController(service, {
      authDevTokens: true,
    } as AppConfiguration);

    const { token, role } = ctrl.issue({ role: Role.Customer });

    expect(role).toBe('CUSTOMER');
    expect(jwt.verify(token)).toMatchObject({ role: 'CUSTOMER', sub: 'customer-dev' });
  });

  it('404s when AUTH_DEV_TOKENS is disabled', () => {
    const ctrl = new DevTokenController(service, {
      authDevTokens: false,
    } as AppConfiguration);

    expect(() => ctrl.issue({ role: Role.Operator })).toThrow(NotFoundException);
  });
});
