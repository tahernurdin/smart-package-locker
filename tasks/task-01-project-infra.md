# Task 01 — Project infrastructure & tooling

**Level:** 1 · **Depends on:** — · **Status:** Not started

## Goal

A running NestJS app wired for config and containers, with the starter "Hello World" removed and a
health endpoint in its place.

## Scope

**In**

- Add runtime deps: `mysql2`, `@nestjs/jwt`, `@nestjs/config`.
- Typed config module in `src/shared/config/` reading from env (no `process.env` elsewhere).
  Keys: `PORT`, `DATABASE_URL` (or discrete `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`),
  `JWT_SECRET`, `AUTH_DEV_TOKENS` (bool), `CURRENCY` (default `AUD`), `NODE_ENV`.
- Remove `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts`.
- `HealthController` → `GET /health` returning `{ status: 'ok', db: 'up' | 'down' }` (db check may
  be a stub returning `up` until Task 02, then wired to a real `SELECT 1`).
- `Dockerfile` — multi-stage (build with dev deps → runtime `node dist/main`).
- `docker-compose.yml` — services `mysql` (`mysql:8.4`, env db name + root password, port 3306,
  healthcheck) and `api` (build ., env vars, port 3000, `depends_on: mysql: condition:
  service_healthy`).
- `.dockerignore`, `.env.example`.
- `main.ts`: read `PORT` from config; enable a global validation pipe (whitelist + transform).

**Out**

- Migration runner and real DB pool → Task 02.
- Any domain/feature code.

## Files

- create: `src/shared/config/config.module.ts`, `src/shared/config/app-config.ts`
- create: `src/health/health.controller.ts`, `src/health/health.module.ts`
- create: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`
- change: `src/app.module.ts` (drop AppController/AppService, import ConfigModule + HealthModule),
  `src/main.ts`, `package.json`
- delete: `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts`
- update: `test/app.e2e-spec.ts` → hit `/health` instead of `/`

## Acceptance criteria

- [ ] `npm install && npm run build` succeeds.
- [ ] `npm run start` boots; `GET /health` returns `200 { status: 'ok', ... }`.
- [ ] `docker compose up` builds and starts both containers; `mysql` reports healthy; `api` stays up.
- [ ] No `process.env.*` reads outside `src/shared/config/`.
- [ ] `npm run test:e2e` passes against `/health`.
