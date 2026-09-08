import { HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import {
  ConflictDomainError,
  RateLimitedDomainError,
} from './domain-error.js';
import { DomainExceptionFilter } from './domain-exception.filter.js';

class LockerTakenError extends ConflictDomainError {
  constructor() {
    super('locker_taken', 'Locker already holds a package');
  }
}

class SlowDownError extends RateLimitedDomainError {
  constructor(retryAfterSeconds: number) {
    super('slow_down', 'Too many attempts', retryAfterSeconds);
  }
}

function mockHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status, setHeader }) }),
  } as never;
  return { host, status, json, setHeader };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('maps a conflict domain error to 409 with its code', () => {
    const { host, status, json } = mockHost();
    filter.catch(new LockerTakenError(), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'locker_taken', statusCode: 409 }),
    );
  });

  it('maps a rate-limited domain error to 429 and says when to come back', () => {
    const { host, status, json, setHeader } = mockHost();
    filter.catch(new SlowDownError(900), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '900');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'slow_down',
        details: { retryAfterSeconds: 900 },
      }),
    );
  });

  it('sets no Retry-After on errors that are not rate limits', () => {
    const { host, setHeader } = mockHost();
    filter.catch(new LockerTakenError(), host);
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('passes an HttpException through', () => {
    const { host, status } = mockHost();
    filter.catch(new NotFoundException('nope'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('maps an unknown error to 500 without leaking its message', () => {
    const { host, status, json } = mockHost();
    filter.catch(new Error('secret db failure'), host);
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.not.objectContaining({ message: 'secret db failure' }),
    );
  });
});
