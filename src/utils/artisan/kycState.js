const { ApiError } = require('../../errors/apiError');
const { sanitizeVerificationForAudience } = require('./kycResponse');
const {
  normalizeRejectionCategory,
  inferRejectionCategory,
  getRetryActionForCategory,
  getProblemTypeForCategory,
} = require('./kycRejection');

const VERIFICATION_STATUSES = Object.freeze({
  pendingDocuments: 'pending_documents',
  documentsUploaded: 'documents_uploaded',
  selfieUploaded: 'selfie_uploaded',
  underReview: 'under_review',
  approved: 'approved',
  rejected: 'rejected',
});

const ALL_VERIFICATION_STATUSES = new Set(Object.values(VERIFICATION_STATUSES));

const ALLOWED_TRANSITIONS = {
  [VERIFICATION_STATUSES.pendingDocuments]: new Set([
    VERIFICATION_STATUSES.pendingDocuments,
    VERIFICATION_STATUSES.documentsUploaded,
  ]),
  [VERIFICATION_STATUSES.documentsUploaded]: new Set([
    VERIFICATION_STATUSES.documentsUploaded,
    VERIFICATION_STATUSES.selfieUploaded,
    VERIFICATION_STATUSES.pendingDocuments,
  ]),
  [VERIFICATION_STATUSES.selfieUploaded]: new Set([
    VERIFICATION_STATUSES.selfieUploaded,
    VERIFICATION_STATUSES.underReview,
    VERIFICATION_STATUSES.approved,
    VERIFICATION_STATUSES.rejected,
    VERIFICATION_STATUSES.documentsUploaded,
  ]),
  [VERIFICATION_STATUSES.underReview]: new Set([
    VERIFICATION_STATUSES.underReview,
    VERIFICATION_STATUSES.approved,
    VERIFICATION_STATUSES.rejected,
    VERIFICATION_STATUSES.documentsUploaded,
    VERIFICATION_STATUSES.selfieUploaded,
  ]),
  [VERIFICATION_STATUSES.approved]: new Set([
    VERIFICATION_STATUSES.approved,
    VERIFICATION_STATUSES.documentsUploaded,
  ]),
  [VERIFICATION_STATUSES.rejected]: new Set([
    VERIFICATION_STATUSES.rejected,
    VERIFICATION_STATUSES.pendingDocuments,
    VERIFICATION_STATUSES.documentsUploaded,
    VERIFICATION_STATUSES.selfieUploaded,
    VERIFICATION_STATUSES.approved,
  ]),
};

function getKycMaxAttempts() {
  return Number(process.env.KYC_MAX_ATTEMPTS) || 3;
}

function getKycRetryCooldownSec() {
  return Math.max(0, Number(process.env.KYC_RETRY_COOLDOWN_SEC) || 0);
}

function getCurrentVerificationStatus(artisan) {
  const raw = String(
    artisan?.verificationStatus || VERIFICATION_STATUSES.pendingDocuments,
  ).trim();
  return ALL_VERIFICATION_STATUSES.has(raw)
    ? raw
    : VERIFICATION_STATUSES.pendingDocuments;
}

function statusToVerificationStep(status) {
  switch (status) {
    case VERIFICATION_STATUSES.pendingDocuments:
      return 0;
    case VERIFICATION_STATUSES.documentsUploaded:
      return 1;
    case VERIFICATION_STATUSES.selfieUploaded:
    case VERIFICATION_STATUSES.underReview:
    case VERIFICATION_STATUSES.approved:
    case VERIFICATION_STATUSES.rejected:
      return 2;
    default:
      return 0;
  }
}

function isApprovedStatus(status) {
  return status === VERIFICATION_STATUSES.approved;
}

function getReviewedByPayload(admin) {
  if (!admin) return undefined;
  return {
    id: admin._id,
    name: admin.name,
    role: admin.role,
  };
}

function resolveRetryAction(artisan) {
  const category = normalizeRejectionCategory(artisan?.rejectionCategory)
    || inferRejectionCategory(artisan?.rejectionReasonInternal);
  return getRetryActionForCategory(category);
}

function resolveProblemType(artisan) {
  const category = normalizeRejectionCategory(artisan?.rejectionCategory)
    || inferRejectionCategory(artisan?.rejectionReasonInternal);
  if (category) {
    return getProblemTypeForCategory(category);
  }
  return artisan?.verificationStatus === VERIFICATION_STATUSES.rejected
    ? 'unknown'
    : null;
}

function getCooldownRemainingSeconds(artisan, now = new Date()) {
  const cooldownSeconds = getKycRetryCooldownSec();
  if (!cooldownSeconds || !artisan?.lastAttemptAt) return 0;
  const elapsedMs = now.getTime() - new Date(artisan.lastAttemptAt).getTime();
  const remainingMs = cooldownSeconds * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

function getAvailableRetryAt(artisan, now = new Date()) {
  const remaining = getCooldownRemainingSeconds(artisan, now);
  if (!remaining) return null;
  return new Date(now.getTime() + remaining * 1000).toISOString();
}

function normalizeVerificationState(artisan) {
  const status = getCurrentVerificationStatus(artisan);
  const attempts = Math.max(0, Number(artisan?.verificationAttempts) || 0);
  const maxAttempts = getKycMaxAttempts();
  const attemptsRemaining = Math.max(0, maxAttempts - attempts);
  const cooldownRemaining = getCooldownRemainingSeconds(artisan);
  const rejectionCategory = normalizeRejectionCategory(artisan?.rejectionCategory)
    || inferRejectionCategory(artisan?.rejectionReasonInternal);
  const canRetry =
    status !== VERIFICATION_STATUSES.underReview &&
    status !== VERIFICATION_STATUSES.approved &&
    attemptsRemaining > 0 &&
    cooldownRemaining === 0;
  let blockedReasonCode = null;
  if (status === VERIFICATION_STATUSES.approved) {
    blockedReasonCode = 'kyc_already_approved';
  } else if (attemptsRemaining <= 0) {
    blockedReasonCode = 'kyc_attempt_limit_reached';
  } else if (cooldownRemaining > 0) {
    blockedReasonCode = 'kyc_cooldown_active';
  }

  return {
    identityVerified: isApprovedStatus(status),
    isVerified: isApprovedStatus(status),
    verificationStep: statusToVerificationStep(status),
    verificationStatus: status,
    attempts,
    maxAttempts,
    attemptsRemaining,
    cooldownRemaining,
    availableRetryAt: getAvailableRetryAt(artisan),
    canRetry,
    failureReason: artisan?.rejectionReasonUserSafe ||
      artisan?.verificationFailureReason ||
      null,
    rejectionCategory,
    rejectionReasonUserSafe: artisan?.rejectionReasonUserSafe || null,
    rejectionReasonInternal: artisan?.rejectionReasonInternal || null,
    confidence: typeof artisan?.verificationConfidence === 'number'
      ? artisan.verificationConfidence
      : null,
    checkedAt: artisan?.verificationCheckedAt || null,
    reviewedAt: artisan?.reviewedAt || null,
    reviewedBy: artisan?.reviewedBy || null,
    lastAttemptAt: artisan?.lastAttemptAt || null,
    hasIdImages: Boolean(artisan?.idFrontImage && artisan?.idBackImage),
    hasSelfieImage: Boolean(artisan?.selfieImage),
    retryAction: resolveRetryAction(artisan),
    problemType: resolveProblemType(artisan),
    blockedReasonCode,
  };
}

function assertVerificationStatus(status) {
  if (!ALL_VERIFICATION_STATUSES.has(status)) {
    throw ApiError.badRequest(`Invalid verification status: ${status}`);
  }
}

function transitionVerificationStatus(artisan, nextStatus, options = {}) {
  assertVerificationStatus(nextStatus);
  const currentStatus = getCurrentVerificationStatus(artisan);
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || new Set();
  if (!options.force && !allowed.has(nextStatus)) {
    throw ApiError.badRequest(
      `Invalid verification transition from ${currentStatus} to ${nextStatus}`,
    );
  }

  const patch = {
    verificationStatus: nextStatus,
    verificationStep: statusToVerificationStep(nextStatus),
    identityVerified: isApprovedStatus(nextStatus),
  };

  if (options.confidence !== undefined) {
    patch.verificationConfidence = options.confidence;
  }
  if (options.checkedAt !== undefined) {
    patch.verificationCheckedAt = options.checkedAt;
  }
  if (options.reviewedAt !== undefined) {
    patch.reviewedAt = options.reviewedAt;
  }
  if (options.reviewedBy !== undefined) {
    patch.reviewedBy = options.reviewedBy;
  }
  if (options.failureReason !== undefined) {
    patch.verificationFailureReason = options.failureReason;
  }
  if (options.rejectionCategory !== undefined) {
    patch.rejectionCategory = options.rejectionCategory;
  }
  if (options.rejectionReasonUserSafe !== undefined) {
    patch.rejectionReasonUserSafe = options.rejectionReasonUserSafe;
  }
  if (options.rejectionReasonInternal !== undefined) {
    patch.rejectionReasonInternal = options.rejectionReasonInternal;
  }
  if (options.idFrontImage !== undefined) {
    patch.idFrontImage = options.idFrontImage;
  }
  if (options.idBackImage !== undefined) {
    patch.idBackImage = options.idBackImage;
  }
  if (options.selfieImage !== undefined) {
    patch.selfieImage = options.selfieImage;
  }

  if (options.incrementAttempts) {
    const nextAttempts = (Number(artisan?.verificationAttempts) || 0) + 1;
    patch.verificationAttempts = nextAttempts;
    patch.lastAttemptAt = options.lastAttemptAt || new Date();
  } else if (options.lastAttemptAt !== undefined) {
    patch.lastAttemptAt = options.lastAttemptAt;
  }

  if (nextStatus !== VERIFICATION_STATUSES.rejected) {
    patch.rejectionCategory = options.rejectionCategory === undefined
      ? null
      : options.rejectionCategory;
    patch.rejectionReasonUserSafe = options.rejectionReasonUserSafe === undefined
      ? null
      : options.rejectionReasonUserSafe;
    patch.rejectionReasonInternal = options.rejectionReasonInternal === undefined
      ? null
      : options.rejectionReasonInternal;
  }

  if (nextStatus === VERIFICATION_STATUSES.pendingDocuments) {
    patch.selfieImage = options.selfieImage === undefined ? null : options.selfieImage;
    patch.verificationConfidence = options.confidence === undefined ? null : options.confidence;
    patch.verificationCheckedAt = options.checkedAt === undefined ? null : options.checkedAt;
    patch.reviewedAt = options.reviewedAt === undefined ? null : options.reviewedAt;
    patch.reviewedBy = options.reviewedBy === undefined ? null : options.reviewedBy;
  }

  return patch;
}

function getVerificationBlockReason(artisan, now = new Date()) {
  const state = normalizeVerificationState(artisan);
  if (state.verificationStatus === VERIFICATION_STATUSES.approved) {
    return {
      status: 409,
      code: 'kyc_already_approved',
      message: 'Identity verification has already been approved.',
      details: {
        verificationStatus: state.verificationStatus,
      },
    };
  }
  if (state.attemptsRemaining <= 0) {
    return {
      status: 429,
      code: 'kyc_attempt_limit_reached',
      message: 'Maximum verification attempts reached. Please contact support.',
      details: {
        attemptsRemaining: state.attemptsRemaining,
        maxAttempts: state.maxAttempts,
        verificationStatus: state.verificationStatus,
      },
    };
  }
  if (state.cooldownRemaining > 0) {
    return {
      status: 429,
      code: 'kyc_cooldown_active',
      message: 'Please wait before retrying verification.',
      details: {
        cooldownRemaining: state.cooldownRemaining,
        attemptsRemaining: state.attemptsRemaining,
        availableRetryAt: state.availableRetryAt,
        verificationStatus: state.verificationStatus,
      },
    };
  }
  return null;
}

function assertCanAttemptVerification(artisan) {
  const blocked = getVerificationBlockReason(artisan);
  if (blocked) {
    const safeState = sanitizeVerificationForAudience(
      normalizeVerificationState(artisan),
      { audience: 'self' },
    );
    throw new ApiError(
      blocked.status || 429,
      blocked.message,
      {
        domain: 'kyc',
        ...safeState,
        ...blocked.details,
      },
      blocked.code,
    );
  }
  return normalizeVerificationState(artisan);
}

module.exports = {
  VERIFICATION_STATUSES,
  getKycMaxAttempts,
  getKycRetryCooldownSec,
  getCurrentVerificationStatus,
  statusToVerificationStep,
  isApprovedStatus,
  getReviewedByPayload,
  resolveRetryAction,
  resolveProblemType,
  normalizeVerificationState,
  transitionVerificationStatus,
  getVerificationBlockReason,
  assertCanAttemptVerification,
};
