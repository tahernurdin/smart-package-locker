# Task 21 — Drop the customers module (`customerId` is an upstream reference)

**Level:** refactor · **Depends on:** 19 · **Status:** Done

## Why

Customer management is not in the brief. The brief mentions customers only as the recipients
packages are stored *for* and the party the pickup code is *shared with* — and that sharing is
"assumed to be sent to the customer through an external notification system (e.g., SMS/email),
which is outside the scope of this challenge." Retrieval is authorized by possession (locker id +
pickup code); no customer attribute is ever read. There is no create/list/update-customer
requirement anywhere.

Tasks 06 and 18 built a `customers/` module (entity, `find-or-create` service, `POST /customers`,
`customer` table + FK) that the brief never asked for. `find-or-create` behind a `POST` also drew
the obvious review objection — 201 when nothing is created, identity guessed from email/phone with
no unique index, racy.

So: the customer belongs to a separate service. This system takes an opaque `customerId`, stores
it, and never resolves it.

## Scope

**In**

- **Delete `src/customers/**`** — module, domain, application (`FindOrCreateCustomerService`),
  infrastructure, interface, DTO, specs.
- **`src/app.module.ts` / `src/packages/packages.module.ts`** — drop the `CustomersModule` import.
- **`src/packages/application/register-package.service.ts`** — remove the `CUSTOMER_REPOSITORY`
  dependency and the `findById` → `CustomerNotFoundError` check. `customerId` passes straight
  through to `Package.register`. Doc comment: opaque upstream reference, not resolved.
- **`register-package.service.spec.ts`** — drop the fake customer repo and the
  `CustomerNotFoundError` case; add a case asserting an arbitrary id is accepted and persisted.
- **`src/packages/interface/dto/register-package.dto.ts`** — keep `@IsUUID() customerId` (the
  upstream service is assumed to issue UUIDs); add a comment.
- **`migrations/001_init.sql`** (edited in place — no deployments) — drop the `customer` table and
  `CONSTRAINT fk_package_customer`. Keep `package.customer_id` + `ix_package_customer`.
- **`001_init.sql`** (Postgres reference) — same, for parity.
- **`test/level1|2|3.e2e-spec.ts`** — drop `createCustomer()` and `DELETE FROM customer`; use a
  `CUSTOMER_ID` constant. `level1`: the "unknown customer → 404" case becomes "register accepts any
  id → 201" (the "unknown package → 404" half stays).
- **Docs** — `README.md` (Assumptions section, endpoints table, walkthrough, layout), `api.http`
  (register + store blocks, `customerId`), `docs/implementation-plan.md` (customer-out-of-scope
  note, endpoints, src tree), `tasks/README.md` + task 06 / 18 / 19 / 20 banners.

**Out**

- Collapsing the `POST /packages` register + `POST /packages/:id/store` split — the two-call flow
  and the `package` / `locker_assignment` table split are kept (task 19 rationale still holds; an
  upstream feed registering a parcel against an upstream `customerId` is coherent).
- Loosening `@IsUUID()` on `customerId`.

## Acceptance criteria

- [x] `src/customers/` is gone; `rg -i customer src` only hits `customerId` on the package.
- [x] `npm run lint` / `npm run build` / `npm run test` green.
- [x] `docker compose up -d mysql && npm run test:e2e` green on a fresh volume.
- [x] `POST /packages` with any well-formed UUID `customerId` → 201; the id round-trips onto the
  package row. No `customer` table in the schema.
