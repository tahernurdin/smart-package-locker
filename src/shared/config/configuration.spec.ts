import { loadConfiguration } from './configuration.js';

const base = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;

describe('loadConfiguration', () => {
  it('parses DATABASE_URL into discrete parts', () => {
    const c = loadConfiguration({
      ...base,
      DATABASE_URL: 'mysql://user:pass@db-host:3307/locker',
    });
    expect(c.database).toEqual({
      host: 'db-host',
      port: 3307,
      user: 'user',
      password: 'pass',
      database: 'locker',
    });
  });

  it('falls back to discrete DB_* vars when no URL is set', () => {
    const c = loadConfiguration({
      ...base,
      DB_HOST: 'h',
      DB_PORT: '3306',
      DB_USER: 'r',
      DB_PASSWORD: 'x',
      DB_NAME: 'n',
    });
    expect(c.database.host).toBe('h');
    expect(c.database.database).toBe('n');
  });

  it('defaults dev tokens on outside production and off in production', () => {
    expect(loadConfiguration(base).authDevTokens).toBe(true);
    expect(
      loadConfiguration({
        NODE_ENV: 'production',
        JWT_SECRET: 's',
        DB_HOST: 'h',
        DB_USER: 'u',
        DB_PASSWORD: 'p',
        DB_NAME: 'd',
      } as NodeJS.ProcessEnv).authDevTokens,
    ).toBe(false);
  });

  it('honours an explicit AUTH_DEV_TOKENS flag', () => {
    expect(loadConfiguration({ ...base, AUTH_DEV_TOKENS: 'false' }).authDevTokens).toBe(
      false,
    );
  });

  it('requires JWT_SECRET in production', () => {
    expect(() =>
      loadConfiguration({
        NODE_ENV: 'production',
        DB_HOST: 'h',
        DB_USER: 'u',
        DB_PASSWORD: 'p',
        DB_NAME: 'd',
      } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_SECRET/);
  });

  it('uses safe defaults in development', () => {
    const c = loadConfiguration(base);
    expect(c.port).toBe(3000);
    expect(c.currency).toBe('AUD');
    expect(c.jwt.secret).toBe('dev-secret-change-me');
  });
});
