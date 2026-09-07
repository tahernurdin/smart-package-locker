# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Task        | Command                                                     |
| ----------- | ----------------------------------------------------------- |
| Install     | `npm install`                                               |
| Run (watch) | `npm run start:dev`                                         |
| Run (once)  | `npm run start`                                             |
| Build       | `npm run build` → `dist/`, then `npm run start:prod`        |
| Lint        | `npm run lint` (oxlint, **not** ESLint)                     |
| Format      | `npm run format` (Prettier: single quotes, trailing commas) |
| Unit tests  | `npm run test` (Vitest, **not** Jest)                       |
| Watch tests | `npm run test:watch`                                        |
| Coverage    | `npm run test:cov`                                          |
| E2E tests   | `npm run test:e2e` (uses `vitest.config.e2e.ts`)            |

Run a single test file or case:

```bash
npx vitest run src/path/to/thing.spec.ts
npx vitest run -t "assigns the smallest locker that fits"
```

Unit specs are `*.spec.ts` co-located with source in `src/`; E2E specs are `*.e2e-spec.ts` in `test/`.

## Environment constraints (easy to trip over)

* **ESM project.** `"type": "module"` and `module`/`moduleResolution: nodenext`. Every relative
  import **must** carry a `.js` extension though the file is `.ts`
  (`import { Foo } from './foo.service.js'`). A missing extension fails at runtime, not compile time.

* **Vitest, not Jest.** `globals: true` — `describe`/`it`/`expect` need no import.
  `@nestjs/testing`'s `Test.createTestingModule` still builds the module under test.

* **oxlint, not ESLint.** Config is `oxlint.json`. Still `await` or `void` every promise.

* Decorators + `reflect-metadata` are enabled; `strictPropertyInitialization` is off, so DI'd
  `private readonly` constructor params need no `!`.

* Node 24, TypeScript strict mode.

## Architecture standards

Clean, layered architecture. Dependencies point **inward**:

HTTP → application → domain. Infrastructure depends on domain, never the reverse.

One deliberate exception: an application service may `import type` a DTO from its own feature's
`interface/dto/` to type a method parameter (see the service-input rule below). Types are erased
at compile time, so no framework or HTTP code actually reaches the application layer — we take
that trade to avoid maintaining a second, identical declaration of every request shape. The
exception is types only, and it stops there: `domain/` imports from nothing above it, and no
layer imports a controller, a pipe, or `class-validator` inward.

```text
src/
  <feature>/
    domain/          entities, value objects, domain errors, repository interfaces (ports)
    application/     use-case services — orchestration only, no framework/HTTP/SQL concerns
    infrastructure/  repository implementations (adapters), DB access, external clients
    interface/       controllers, DTOs, request/response mapping
    <feature>.module.ts
  shared/            cross-cutting: config, clock, id/code generation, base errors, guards
```

### Working agreement

The architecture and engineering decisions in this file are intentional project decisions.
Claude Code should implement within these constraints and should not introduce architectural
changes or new abstractions without validating them against the existing design and task
requirements.

* **Thin controllers.** Validate input into a DTO, call one application-service method, let a
  global exception filter map thrown domain errors to HTTP status. No business rules, no `try/catch`
  for flow control.

* **One use case per service method** (`storePackage`, `retrievePackage`, `listLockers`). Services
  coordinate domain objects and repositories; they never touch `Request`/`Response` or SQL.

* **A service takes the DTO — don't hand-write a parallel input type.** The DTO *is* the
  use-case's input contract when the use case receives exactly the request body. This is a
  deliberate pragmatic choice for this project: creating an identical application-layer type
  would add ceremony without providing meaningful separation.

  When a use case combines data from multiple request sources, declare an `XInput` interface
  beside the service and let the controller assemble it. `StorePackageService.store` is the
  only one today: `packageId` comes from the path and `agentId` from the JWT, and neither may be
  accepted from the body.

  Import the DTO with `import type` so nothing but the type crosses the boundary — the service
  must never construct one, read its decorators, or import `class-validator`. A DTO is a data
  shape at that point, nothing more.

  Signatures follow the request's shape, in this order:

  * body only → `create(dto: CreateXDto)`
  * path id + body → `update(id: string, dto: UpdateXDto)`
  * multiple sources → declare an `XInput` interface beside the service and let the controller assemble it

* **DTO types are not business guarantees.** `@IsIn`/`@IsUUID` narrow a field only for callers
  that went through the HTTP pipe. Services still re-check invariants in the domain
  (`LockerSize.of(input.size)` throws even though `CreateLockerDto.size` is typed
  `LockerSizeCode`), and specs may cast to prove it.

* **Framework-free domain.** No `@Injectable()`, no imports from `@nestjs/*` under `domain/`.
  Entities enforce their own invariants; an invalid entity should be unconstructable.

* **Depend on abstractions (DIP).** Application services inject repository *interfaces* declared in
  `domain/`. Bind them to implementations in the module with an injection token:
  `{ provide: LOCKER_REPOSITORY, useClass: MysqlLockerRepository }`. The only place a concrete
  adapter is named is a module's `providers` array.

* **SOLID in practice:**

  * *SRP* — split distinct responsibilities into separate collaborators (allocate a resource /
    generate a code / compute a price are three objects, not one method).
  * *OCP* — variation that grows over time (categories, pricing tiers, rules) is data or a strategy
    behind an interface, not new `switch` arms.
  * *ISP* — repository interfaces are narrow and role-based, not one god-repository.
  * *DIP* — see above.

* **Determinism for testability.** Never call `new Date()` / `Date.now()` or a raw RNG inside
  domain or application code. Inject a `Clock` and id/code generators; tests drive fakes.

* **Typed domain errors.** Throw domain error classes (extending a shared `DomainError`) from
  domain/application; translate to HTTP only at the edge via a Nest exception filter. Never throw
  `HttpException` from a service.

* **Validation has two layers.** DTOs validate shape/format at the controller boundary; business
  invariants are (re-)checked in the domain — never trust a DTO for a business rule.

* **Money as integer minor units** (cents) in a single configured currency. No floating point.

* **Config through a typed config module**, read from env. No `process.env` reads scattered through
  the code.

## Testing conventions

* Unit-test domain objects and application services in isolation, injecting in-memory fake
  repositories — no DB, no HTTP.

* Reserve E2E (`*.e2e-spec.ts`) for controller-to-DB happy paths and the handful of error paths
  that matter.

* Every new use-case service ships with a spec covering its success path and each domain error it
  can raise.
