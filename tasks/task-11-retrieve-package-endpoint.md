# Task 11 — Retrieve package endpoint

**Level:** 2 · **Depends on:** 10 · **Status:** Done

## Goal

Expose retrieval over HTTP: `POST /packages/retrieve` for the Customer role.

## Scope

**In**

- `src/packages/interface/dto/retrieve-package.dto.ts`:
  ```ts
  export class RetrievePackageDto {
    @IsUUID() lockerId!: string;
    @Matches(/^\d{6}$/) pickupCode!: string;
  }
  ```
- `src/packages/interface/packages.controller.ts` — add:
  ```ts
  @Post('retrieve')
  @Auth(Role.Customer)
  @HttpCode(200)
  retrieve(@Body() dto: RetrievePackageDto) { return this.retrievePackage.retrieve(dto); }
  ```
- `src/packages/packages.module.ts` — register `RetrievePackageService` and
  `{ provide: STORAGE_FEE_POLICY, useClass: FlatZeroStorageFeePolicy }`. `LOCKER_REPOSITORY` and
  `PACKAGE_REPOSITORY` are already available (via `LockersModule` import / local provider).
- Response body (200):
  ```json
  {
    "packageId": "…", "lockerId": "…", "lockerCode": "A-01",
    "retrievedAt": "2026-09-07T…Z",
    "storageFee": { "amountMinor": 0, "currency": "AUD" },
    "opened": true
  }
  ```
- Error mapping is already handled by `DomainExceptionFilter`:
  `PackageNotFoundForRetrievalError` → 404, `PackageAlreadyRetrievedError` → 409,
  `InvalidPickupCodeError` → 422, DTO shape failures → 400.

**Out**

- Any change to the exception filter (kinds already cover this).
- E2E → Task 12.

## Files

- create: `src/packages/interface/dto/retrieve-package.dto.ts`
- change: `src/packages/interface/packages.controller.ts`, `src/packages/packages.module.ts`

## Acceptance criteria

- [ ] `POST /packages/retrieve` with a valid `{ lockerId, pickupCode }` as CUSTOMER → 200 with the
  body above; the locker then shows `FREE` / `activePackageId: null` in `GET /lockers`.
- [ ] As AGENT → 403; no token → 401; malformed body → 400.
- [ ] Retrieving the same locker+code again → 404 `retrieval_failed`.
- [ ] `npm run lint` / `npm run build` / `npm run test` green.
