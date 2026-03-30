# Usta Backend Artisan KYC Report

## Overview

This backend update adds an artisan-only identity verification pipeline with secure file handling, retry controls, and pluggable face comparison.

Important compatibility decision:

- The existing backend already uses `Artisan.verified` for account approval / activation.
- KYC was implemented with separate fields such as `identityVerified` and `verificationStep`.
- This avoids breaking the current login approval flow while still enforcing identity verification for artisans at the product level.

## Schema Changes

Added to `Artisan`:

- `identityVerified`
- `verificationStep`
- `verificationStatus`
- `verificationAttempts`
- `verificationFailureReason`
- `verificationConfidence`
- `verificationCheckedAt`
- `idFrontImage`
- `idBackImage`
- `selfieImage`

File:

- `src/models/artisan.model.js`

## New Endpoints

The following artisan-authenticated routes were added:

- `GET /api/artisan/verification/status`
- `POST /api/artisan/verification/upload-id`
- `POST /api/artisan/verification/upload-selfie`

Compatibility aliases were also added:

- `GET /api/verification/status`
- `POST /api/verification/upload-id`
- `POST /api/verification/upload-selfie`

Files:

- `src/routes/artisan/artisan.routes.js`
- `src/controllers/artisan/artisan.verification.controller.js`

## Security Hardening

### Private uploads

Verification images are stored under private upload paths and blocked from public access.

Files:

- `src/utils/shared/privateUploads.js`
- `src/app.js`

Behavior:

- `/uploads/private/*` now returns `403`
- Verification images are compressed and stored under private directories
- Old replaced files are cleaned up safely

### Upload validation

Added strict multipart validation:

- image-only MIME types
- file-size cap
- multer memory storage

File:

- `src/middlewares/artisan/verificationUpload.js`

### Verification throttling

Added retry control:

- default max attempts: `3`
- after the limit is reached, the backend blocks more verification attempts

File:

- `src/utils/artisan/kycState.js`

## Face Verification Provider

Implemented provider-based face matching with AWS Rekognition support.

File:

- `src/services/kyc/faceVerification.service.js`

Behavior:

- Production-ready path: AWS Rekognition
- Dev/test fallback: mock provider when AWS config is not available
- Confidence threshold default: `80`

## Environment Variables

Recommended variables:

```env
KYC_PROVIDER=aws
AWS_REGION=eu-central-1
KYC_CONFIDENCE_THRESHOLD=80
KYC_MAX_ATTEMPTS=3
KYC_MAX_FILE_BYTES=6291456
```

Optional mock/dev settings:

```env
KYC_PROVIDER=mock
KYC_MOCK_RESULT=match
```

Allowed mock values:

- `match`
- `fail`
- `error`

## Folder Structure Added

```text
src/
  controllers/artisan/artisan.verification.controller.js
  middlewares/artisan/verificationUpload.js
  services/kyc/faceVerification.service.js
  utils/artisan/kycState.js
  utils/shared/privateUploads.js
test/
  faceVerification.test.js
  kyc.state.test.js
  verification.routes.test.js
docs/
  ARTISAN_KYC_BACKEND_REPORT.md
  postman/Usta-KYC.postman_collection.json
```

## Tests Added

Added coverage for:

- KYC state normalization
- max attempt enforcement
- mock face verification provider
- unauthenticated verification route blocking
- private upload access blocking

## Verification Results

Executed successfully:

- `npm run check:syntax`
- `npm test`

Result:

- `npm run check:syntax` -> passed
- `npm test` -> 16 tests passed

## Dependency Audit

After integrating AWS Rekognition and running `npm audit fix`:

- remaining issues: `9 low`

Current remaining issues are tied to:

- `firebase-admin` dependency chain
- `nodemailer` major-version upgrade path

These were intentionally not force-upgraded to avoid a breaking production regression without a broader regression pass.
