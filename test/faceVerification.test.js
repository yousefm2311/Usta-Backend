const test = require('node:test');
const assert = require('node:assert/strict');

const {
  verifyArtisanIdentity,
  REVIEW_THRESHOLD,
  classifyConfidence,
  isAutoApproveHighConfidenceEnabled,
} = require('../src/services/kyc/faceVerification.service');

test('mock provider returns a successful identity match by default', async () => {
  const previousProvider = process.env.KYC_PROVIDER;
  const previousMode = process.env.KYC_MOCK_RESULT;
  process.env.KYC_PROVIDER = 'mock';
  delete process.env.KYC_MOCK_RESULT;

  try {
    const result = await verifyArtisanIdentity({
      idImagePath: '/tmp/id.webp',
      selfieImagePath: '/tmp/selfie.webp',
    });

    assert.equal(result.matched, true);
    assert.equal(result.provider, 'mock');
    assert.equal(result.userSafeReason, null);
    assert.equal(result.finalStatus, 'approved');
    assert.ok(result.confidence > REVIEW_THRESHOLD);
  } finally {
    if (previousProvider === undefined) delete process.env.KYC_PROVIDER;
    else process.env.KYC_PROVIDER = previousProvider;
    if (previousMode === undefined) delete process.env.KYC_MOCK_RESULT;
    else process.env.KYC_MOCK_RESULT = previousMode;
  }
});

test('mock provider can force a failed comparison', async () => {
  const previousProvider = process.env.KYC_PROVIDER;
  const previousMode = process.env.KYC_MOCK_RESULT;
  process.env.KYC_PROVIDER = 'mock';
  process.env.KYC_MOCK_RESULT = 'fail';

  try {
    const result = await verifyArtisanIdentity({
      idImagePath: '/tmp/id.webp',
      selfieImagePath: '/tmp/selfie.webp',
    });

    assert.equal(result.matched, false);
    assert.equal(result.provider, 'mock');
    assert.equal(result.finalStatus, 'rejected');
    assert.match(result.internalReason, /face|rejected/i);
  } finally {
    if (previousProvider === undefined) delete process.env.KYC_PROVIDER;
    else process.env.KYC_PROVIDER = previousProvider;
    if (previousMode === undefined) delete process.env.KYC_MOCK_RESULT;
    else process.env.KYC_MOCK_RESULT = previousMode;
  }
});

test('mock provider can force a manual-review outcome', async () => {
  const previousProvider = process.env.KYC_PROVIDER;
  const previousMode = process.env.KYC_MOCK_RESULT;
  process.env.KYC_PROVIDER = 'mock';
  process.env.KYC_MOCK_RESULT = 'review';

  try {
    const result = await verifyArtisanIdentity({
      idImagePath: '/tmp/id.webp',
      selfieImagePath: '/tmp/selfie.webp',
    });

    assert.equal(result.finalStatus, 'under_review');
    assert.equal(result.matched, false);
    assert.match(result.internalReason, /manual_review/i);
  } finally {
    if (previousProvider === undefined) delete process.env.KYC_PROVIDER;
    else process.env.KYC_PROVIDER = previousProvider;
    if (previousMode === undefined) delete process.env.KYC_MOCK_RESULT;
    else process.env.KYC_MOCK_RESULT = previousMode;
  }
});

test('classifyConfidence maps thresholds into rejected, review, and approved', () => {
  assert.equal(classifyConfidence(45).status, 'rejected');
  assert.equal(classifyConfidence(70).status, 'under_review');
  assert.equal(classifyConfidence(95).status, 'approved');
});

test('high confidence falls back to under_review when auto-approve is disabled', () => {
  const previous = process.env.KYC_AUTO_APPROVE_HIGH_CONFIDENCE;
  process.env.KYC_AUTO_APPROVE_HIGH_CONFIDENCE = 'false';

  try {
    assert.equal(isAutoApproveHighConfidenceEnabled(), false);
    const result = classifyConfidence(96);
    assert.equal(result.status, 'under_review');
    assert.match(result.internalReason, /manual_review_high_confidence/i);
  } finally {
    if (previous === undefined) delete process.env.KYC_AUTO_APPROVE_HIGH_CONFIDENCE;
    else process.env.KYC_AUTO_APPROVE_HIGH_CONFIDENCE = previous;
  }
});

test('mock provider can surface provider errors cleanly', async () => {
  const previousProvider = process.env.KYC_PROVIDER;
  const previousMode = process.env.KYC_MOCK_RESULT;
  process.env.KYC_PROVIDER = 'mock';
  process.env.KYC_MOCK_RESULT = 'error';

  try {
    await assert.rejects(
      () => verifyArtisanIdentity({
        idImagePath: '/tmp/id.webp',
        selfieImagePath: '/tmp/selfie.webp',
      }),
      /forced an error/,
    );
  } finally {
    if (previousProvider === undefined) delete process.env.KYC_PROVIDER;
    else process.env.KYC_PROVIDER = previousProvider;
    if (previousMode === undefined) delete process.env.KYC_MOCK_RESULT;
    else process.env.KYC_MOCK_RESULT = previousMode;
  }
});
