const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VERIFICATION_STATUSES,
  getKycMaxAttempts,
  normalizeVerificationState,
  assertCanAttemptVerification,
  transitionVerificationStatus,
} = require('../src/utils/artisan/kycState');

test('normalizeVerificationState returns safe defaults', () => {
  const state = normalizeVerificationState({});

  assert.equal(state.isVerified, false);
  assert.equal(state.verificationStep, 0);
  assert.equal(state.verificationStatus, VERIFICATION_STATUSES.pendingDocuments);
  assert.equal(state.attempts, 0);
  assert.equal(state.maxAttempts, getKycMaxAttempts());
  assert.equal(state.attemptsRemaining, getKycMaxAttempts());
  assert.equal(state.hasIdImages, false);
  assert.equal(state.hasSelfieImage, false);
});

test('normalizeVerificationState reflects uploaded KYC artifacts', () => {
  const state = normalizeVerificationState({
    identityVerified: false,
    verificationStep: 2,
    verificationStatus: VERIFICATION_STATUSES.rejected,
    verificationAttempts: 2,
    rejectionReasonUserSafe: 'Face mismatch detected',
    rejectionReasonInternal: 'face_mismatch_low_confidence',
    verificationConfidence: 73.25,
    idFrontImage: '/uploads/private/verification/id/front.webp',
    idBackImage: '/uploads/private/verification/id/back.webp',
    selfieImage: '/uploads/private/verification/selfie/selfie.webp',
  });

  assert.equal(state.verificationStep, 2);
  assert.equal(state.verificationStatus, VERIFICATION_STATUSES.rejected);
  assert.equal(state.attempts, 2);
  assert.equal(state.attemptsRemaining, Math.max(0, getKycMaxAttempts() - 2));
  assert.equal(state.canRetry, getKycMaxAttempts() > 2);
  assert.equal(state.failureReason, 'Face mismatch detected');
  assert.equal(state.problemType, 'face_mismatch');
  assert.equal(state.retryAction, 'both');
  assert.equal(state.confidence, 73.25);
  assert.equal(state.hasIdImages, true);
  assert.equal(state.hasSelfieImage, true);
});

test('assertCanAttemptVerification blocks after max retries', () => {
  assert.throws(
    () => assertCanAttemptVerification({ verificationAttempts: getKycMaxAttempts() }),
    /Maximum verification attempts reached/,
  );
});

test('transitionVerificationStatus derives identity flags from status', () => {
  const patch = transitionVerificationStatus(
    { verificationStatus: VERIFICATION_STATUSES.selfieUploaded },
    VERIFICATION_STATUSES.approved,
    { confidence: 97.5 },
  );

  assert.equal(patch.verificationStatus, VERIFICATION_STATUSES.approved);
  assert.equal(patch.identityVerified, true);
  assert.equal(patch.verificationStep, 2);
  assert.equal(patch.verificationConfidence, 97.5);
});
