# Task 06 — Customers context

**Level:** 1 · **Depends on:** 02, 03 · **Status:** Done

## Goal

A minimal customer record so a stored package can be attached to the person picking it up. No
controller in Level 1 — the customer is supplied inline when an agent stores a package.

## Scope

**In**

- `src/customers/domain/`:
  - `customer.entity.ts` — `id`, `name`, `email?`, `phone?`, `createdAt`. Construction enforces
    "at least one contact method" (mirrors the `chk_customer_has_contact` constraint).
  - `customer.repository.ts` — port `CUSTOMER_REPOSITORY`:
    - `findByContact({ email?, phone? }): Promise<Customer | null>`
    - `save(customer): Promise<void>`
  - `errors.ts` — `CustomerContactRequiredError extends ValidationDomainError`.
- `src/customers/application/find-or-create-customer.service.ts` —
  `findOrCreate({ name, email?, phone? })`: match on email (then phone); create via `IdGenerator`
  + `Clock` if no match; return the `Customer`.
- `src/customers/infrastructure/mysql-customer.repository.ts`.
- `src/customers/customers.module.ts` — binds the port, exports
  `FindOrCreateCustomerService` for the packages module.

**Out**

- Customer-facing endpoints, profile edits, dedupe/merge — not needed for the challenge.

## Files

- create: everything under `src/customers/**`
- create: `src/customers/application/find-or-create-customer.service.spec.ts`
- change: `src/app.module.ts`

## Acceptance criteria

- [ ] Constructing a `Customer` with neither email nor phone throws
  `CustomerContactRequiredError`.
- [ ] Unit tests (fake repo): `findOrCreate` returns the existing customer when email matches;
  creates exactly one when it doesn't.
- [ ] `CustomersModule` exports the service; `PackagesModule` (Task 07) can inject it.
