# Task 08 — Level 1 end-to-end + docs

**Level:** 1 · **Depends on:** 05, 07 · **Status:** Done

## Goal

Prove the Level 1 flow works against a real MySQL, and document how to run it.

## Scope

**In**

- `test/level1.e2e-spec.ts` (runs against the docker MySQL; migrations applied on boot):
  1. Mint OPERATOR + AGENT tokens via `POST /auth/dev-token`.
  2. OPERATOR `POST /lockers` ×3 — one SMALL, one MEDIUM, one LARGE.
  3. `GET /lockers` → all three `FREE`.
  4. AGENT `POST /packages` `{ size: SMALL, customer }` → 201 with `lockerId` + 6-digit
     `pickupCode`; assigned locker is the **SMALL** one (smallest fit).
  5. `GET /lockers` → the SMALL locker now `OCCUPIED`, MEDIUM + LARGE still `FREE`.
  6. AGENT `POST /packages` `{ size: SMALL }` again → assigned the **MEDIUM** locker (next
     smallest fit now that SMALL is taken).
  7. AGENT `POST /packages` `{ size: LARGE }` → assigned LARGE. Now every locker is occupied.
  8. AGENT `POST /packages` `{ size: SMALL }` once more → 409 "No suitable locker is available".
  9. Auth negatives: `POST /lockers` as AGENT → 403; `POST /packages` with no token → 401.
- `README.md` rewrite — replace the NestJS boilerplate with:
  - What the service does + link to `docs/implementation-plan.md`.
  - `docker compose up` quickstart.
  - How to get a token per role (`POST /auth/dev-token`, or the boot log, or `npm run token`).
  - `curl` walkthrough for the Level 1 endpoints (create locker → list → store).
  - Local dev without docker: `.env` from `.env.example`, `npm run db:migrate`, `npm run start:dev`.
  - Test commands.
- `tasks/README.md` — tick the Level 1 statuses.

**Out**

- Retrieval / fee / concurrency e2e → their own level task sets.

## Files

- create: `test/level1.e2e-spec.ts`
- rewrite: `README.md`
- change: `tasks/README.md`

## Acceptance criteria

- [ ] `docker compose up -d mysql && npm run test:e2e` passes `level1.e2e-spec.ts`.
- [ ] `npm run lint`, `npm run build`, `npm run test` all green.
- [ ] A new reader can go from clone → storing a package following only `README.md`.
