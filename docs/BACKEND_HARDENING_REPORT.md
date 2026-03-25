# Backend Hardening Report

## Scope

This pass focused on the Node.js/Express backend used by the Usta application.

Primary goals:

- Remove backend auth edge cases that could surface as 500 errors
- Add a real automated test pipeline
- Improve runtime scripts and release readiness
- Reduce dependency vulnerabilities where safe

## Key Fixes

### 1. Fixed auth validation gaps for customer and artisan flows

Several auth endpoints accepted requests where both `email` and `phone` were
missing. In those cases, controllers could build Mongo queries with an empty
`$or` array, which is unsafe and can lead to server-side failures instead of a
clean validation response.

Fixed endpoints include:

- Customer `signup`
- Customer `login`
- Customer `verify`
- Customer `forgot-password`
- Customer `resend-verification`
- Artisan `signup`
- Artisan `login`
- Artisan `verify`
- Artisan `forgot-password`
- Artisan `resend-verification`
- Reset-code verification routes for both sides

Result:

- Invalid payloads now return `400 Validation error`
- No more backend crash path caused by missing contact identity

### 2. Added defensive query building in controllers

Created a shared utility for:

- normalizing contact identity
- requiring at least one of `email` or `phone`
- building safe Mongo lookup filters

This adds protection at controller level even if route validation is modified in
the future.

### 3. Improved refresh-token robustness

Artisan refresh-token handling now accepts the same fallback style as customer:

- Authorization header
- or `body.refreshToken`

This makes the API more tolerant to client integration differences.

### 4. Added real project scripts

The backend previously had:

- no working `npm start`
- no real `npm test`

Now it includes:

- `npm start`
- `npm run dev`
- `npm test`
- `npm run check:syntax`

### 5. Added automated tests

Implemented a real test suite using Node's built-in test runner.

Covered areas:

- health endpoint
- structured 404 handling
- customer auth validation failures
- artisan auth validation failures
- refresh-token missing-token behavior
- shared contact identity utility behavior

## Verification Performed

Executed successfully:

```bash
npm run check:syntax
npm test
```

Results:

- Syntax check passed
- All tests passed

## Dependency Security Pass

Executed:

```bash
npm audit fix
```

Outcome:

- Vulnerabilities were reduced significantly
- Remaining issues are low severity only
- Remaining advisories are tied to the `firebase-admin` dependency chain and
  require a major-version downgrade/force path that may break current Firebase
  integration, so that change was not forced automatically

## Files Added or Updated

- `src/utils/shared/contactIdentity.js`
- `src/utils/shared/requestValidation.js`
- `src/routes/customer/customer.routes.js`
- `src/routes/artisan/artisan.routes.js`
- `src/controllers/customer/customer.controller.js`
- `src/controllers/artisan/artisan.controller.js`
- `package.json`
- `README.md`
- `test/app.test.js`
- `test/auth.validation.test.js`
- `test/contactIdentity.test.js`
- `test_support/http.js`

## Notes

- `package-lock.json` changed because dependencies were installed and audit fixes
  were applied.
- No breaking database schema change was introduced in this pass.
- A deeper next pass could focus on:
  - controller-level business-rule tests with mocked models
  - socket/realtime integration tests
  - payment and wallet flow tests
  - request lifecycle end-to-end tests
