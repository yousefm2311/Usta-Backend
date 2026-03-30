const test = require('node:test');
const assert = require('node:assert/strict');

const {
  KYC_REJECTION_CATEGORIES,
  buildRejectionPayload,
  getRetryActionForCategory,
  getProblemTypeForCategory,
  getUserSafeRejectionMessage,
} = require('../src/utils/artisan/kycRejection');

test('buildRejectionPayload normalizes category and user-safe text', () => {
  const payload = buildRejectionPayload({
    category: KYC_REJECTION_CATEGORIES.idBlurry,
    internalReason: 'document_face_not_detected',
  });

  assert.equal(payload.rejectionCategory, KYC_REJECTION_CATEGORIES.idBlurry);
  assert.equal(
    payload.rejectionReasonUserSafe,
    getUserSafeRejectionMessage(KYC_REJECTION_CATEGORIES.idBlurry),
  );
});

test('category maps to retry action and problem type', () => {
  assert.equal(getRetryActionForCategory(KYC_REJECTION_CATEGORIES.faceNotClear), 'selfie');
  assert.equal(getProblemTypeForCategory(KYC_REJECTION_CATEGORIES.idInvalid), 'document_issue');
});
