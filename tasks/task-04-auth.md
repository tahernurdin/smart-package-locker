# Task 04 — Auth: dummy JWT per role

**Level:** 1 · **Depends on:** 01, 03 · **Status:** Not started

## Goal

Route protection by role, plus a dev-only way to mint a JWT for each of the three roles.

## Scope

**In**

- `src/shared/auth/`:
  - `roles.ts` — `Role` enum: `OPERATOR`, `AGENT`, `CUSTOMER`.
  - `jwt.module.ts` — `@nestjs/jwt` configured from `JWT_SECRET`, ~12h expiry.
  - `jwt-auth.guard.ts` — verifies `Authorization: Bearer <token>`, attaches
    `{ sub, role }` to the request; 401 on missing/invalid.
  - `roles.guard.ts` + `@Roles(...roles)` decorator — 403 when the token role isn't allowed.
  - `@CurrentUser()` param decorator — returns `{ sub, role }`.
  - `dev-token.controller.ts` → `POST /auth/dev-token` body `{ role, sub? }` → `{ token }`.
    Registered **only** when `AUTH_DEV_TOKENS` is true; otherwise the route 404s.
  - `dev-token.service.ts` — signs `{ sub: sub ?? '<role>-dev', role }`.
- Boot behaviour: when `AUTH_DEV_TOKENS` is true and `NODE_ENV !== 'production'`, log one ready
  token per role at startup.
- `npm run token -- --role AGENT [--sub id]` — standalone script printing a signed token.

**Out**

- Real user store, refresh tokens, password auth — not in this challenge.
- Applying `@Roles` to feature controllers → done in Tasks 05 / 07.

## Files

- create: `src/shared/auth/{roles.ts,jwt.module.ts,jwt-auth.guard.ts,roles.guard.ts,roles.decorator.ts,current-user.decorator.ts,dev-token.controller.ts,dev-token.service.ts,auth.module.ts}`
- create: `src/shared/auth/token.cli.ts`
- change: `src/app.module.ts`, `src/main.ts` (boot token log), `package.json`

## Notes

- `JwtAuthGuard` + `RolesGuard` are applied per-controller/route via decorators, not globally —
  `/health` and `/auth/dev-token` stay public.
- Keep the payload minimal: `sub`, `role`. Retrieval authorization (Task L2) is by locker id +
  pickup code, not by customer identity in the token.

## Acceptance criteria

- [ ] `POST /auth/dev-token { "role": "OPERATOR" }` returns a token that decodes to
  `{ sub, role: 'OPERATOR' }`.
- [ ] With `AUTH_DEV_TOKENS=false`, `POST /auth/dev-token` returns 404.
- [ ] Unit tests: `RolesGuard` allows a matching role, 403s a mismatch; `JwtAuthGuard` 401s a
  missing/garbage token.
- [ ] `npm run token -- --role CUSTOMER` prints a usable token.
