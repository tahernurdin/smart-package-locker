# Task 18 — `POST /customers` endpoint + `CustomerRepository.findById`

**Level:** refactor · **Depends on:** 17 · **Status:** Reverted (see task 21)

> **Reverted by task 21.** `POST /customers` and the whole `customers/` module are removed —
> customer identity belongs to an upstream service. `POST /packages` takes an opaque `customerId`
> that is stored but never resolved. Kept for history.

## Why

Once package registration happens upstream (task 19), the customer already exists by the time a
package is registered — registration will take a `customerId`, not inline contact details. So
customer creation needs to be its own endpoint, and the customer repository needs a lookup by id.

This task is standalone and non-breaking: `POST /packages` still accepts an inline customer until
task 19 changes it.

## Scope

**In**

- `src/customers/domain/customer.repository.ts` — add `findById(id: string): Promise<Customer | null>`.
- `src/customers/infrastructure/mysql-customer.repository.ts` — implement it.
- `src/customers/interface/`:
  - `dto/create-customer.dto.ts` — `name` (non-empty, ≤120), `email?` (`@IsEmail`), `phone?`
    (string, ≤40). The "at least one contact" rule stays in the domain (`Customer.register` →
    `CustomerContactRequiredError` → 422).
  - `customers.controller.ts` — `@Controller('customers')` `@Auth(Role.Agent)`:
    `POST /customers` → 201 `{ customerId, name, email, phone }`. Delegates to
    `FindOrCreateCustomerService` — **idempotent on exact email/phone match** so an upstream retry
    doesn't create a duplicate customer.
- `src/customers/customers.module.ts` — register `CustomersController` (still exports
  `FindOrCreateCustomerService`).
- `errors.ts` — add `CustomerNotFoundError extends NotFoundDomainError` (`customer_not_found`),
  used by task 19's register flow.

**Out**

- `GET /customers/:id`, customer edit/list — not needed.
- Changing `POST /packages` — task 19.
- A dedicated back-office role — `@Auth(Role.Agent)` for now; note in a comment that customer
  creation and package registration would be an integration/back-office role in a fuller system.

## Files

- change: `src/customers/domain/customer.repository.ts`,
  `src/customers/domain/errors.ts`,
  `src/customers/infrastructure/mysql-customer.repository.ts`,
  `src/customers/customers.module.ts`,
  `src/app.module.ts` (already imports `CustomersModule` — no change expected)
- create: `src/customers/interface/dto/create-customer.dto.ts`,
  `src/customers/interface/customers.controller.ts`,
  `src/customers/interface/customers.controller.spec.ts`

## Acceptance criteria

- [ ] `POST /customers { name, email }` as AGENT → 201 `{ customerId, … }`; as CUSTOMER → 403; no
  token → 401.
- [ ] `POST /customers` with neither email nor phone → 422 `customer_contact_required`.
- [ ] Posting the same email twice returns the same `customerId` (no duplicate row).
- [ ] Unit: `CustomerRepository.findById` returns the row / null (fake or manual DB check).
- [ ] `npm run lint` / `npm run build` / `npm run test` / `npm run test:e2e` green.
