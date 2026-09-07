/**
 * Typed application configuration. This is the ONLY place `process.env` is read;
 * everything else injects `APP_CONFIG`.
 */

export const APP_CONFIG = Symbol('APP_CONFIG');

export type AppEnv = 'development' | 'test' | 'production';

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface AppConfiguration {
  nodeEnv: AppEnv;
  isProduction: boolean;
  port: number;
  database: DatabaseConfig;
  jwt: { secret: string; expiresIn: string };
  authDevTokens: boolean;
  currency: string;
  pickupCodePepper: string;
}

export class ConfigError extends Error {}

function required(name: string, value: string | undefined): string {
  if (value === undefined || value === '') {
    throw new ConfigError(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseDatabase(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
): DatabaseConfig {
  const url = env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username) || 'root',
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, '') || 'locker',
    };
  }

  const dev = <T>(devValue: T, prodName: string, raw: string | undefined): T =>
    raw !== undefined
      ? (raw as unknown as T)
      : isProduction
        ? (required(prodName, raw) as unknown as T)
        : devValue;

  return {
    host: dev('127.0.0.1', 'DB_HOST', env.DB_HOST),
    port: Number(env.DB_PORT ?? 3306),
    user: dev('root', 'DB_USER', env.DB_USER),
    password: dev('root', 'DB_PASSWORD', env.DB_PASSWORD),
    database: dev('locker', 'DB_NAME', env.DB_NAME),
  };
}

export function loadConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): AppConfiguration {
  const nodeEnv = (env.NODE_ENV as AppEnv) || 'development';
  const isProduction = nodeEnv === 'production';

  return {
    nodeEnv,
    isProduction,
    port: Number(env.PORT ?? 3000),
    database: parseDatabase(env, isProduction),
    jwt: {
      secret: isProduction
        ? required('JWT_SECRET', env.JWT_SECRET)
        : (env.JWT_SECRET ?? 'dev-secret-change-me'),
      expiresIn: env.JWT_EXPIRES_IN ?? '12h',
    },
    authDevTokens: parseBool(env.AUTH_DEV_TOKENS, !isProduction),
    currency: env.CURRENCY ?? 'AUD',
    pickupCodePepper: env.PICKUP_CODE_PEPPER ?? '',
  };
}
