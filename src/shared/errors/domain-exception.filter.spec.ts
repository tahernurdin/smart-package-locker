import { HttpStatus, Logger, NotFoundException } from '@nestjs/common';
import { ConflictDomainError } from './domain-error.js';
import { DomainExceptionFilter } from './domain-exception.filter.js';

class LockerTakenError extends ConflictDomainError {
  constructor() {
    super('locker_taken', 'Locker already holds a package');
  }
}

function mockHost() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as never;
  return { host, status, json };
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
