const KYC_REJECTION_CATEGORIES = Object.freeze({
  idBlurry: 'id_blurry',
  idInvalid: 'id_invalid',
  faceMismatch: 'face_mismatch',
  faceNotClear: 'face_not_clear',
  fraudSuspected: 'fraud_suspected',
});

const USER_SAFE_REJECTION_MESSAGES = Object.freeze({
  [KYC_REJECTION_CATEGORIES.idBlurry]:
    'صور البطاقة غير واضحة. يرجى إعادة رفع البطاقة بصورة أكثر وضوحًا.',
  [KYC_REJECTION_CATEGORIES.idInvalid]:
    'تعذر التحقق من البطاقة. يرجى التأكد من أنها بطاقة صحيحة وكاملة.',
  [KYC_REJECTION_CATEGORIES.faceMismatch]:
    'صورة الوجه لا تطابق بيانات الهوية بشكل كافٍ. يرجى إعادة المحاولة.',
  [KYC_REJECTION_CATEGORIES.faceNotClear]:
    'صورة السيلفي غير واضحة. يرجى التقاط صورة أمامية واضحة للوجه.',
  [KYC_REJECTION_CATEGORIES.fraudSuspected]:
    'تعذر إكمال التحقق الآن. يرجى التواصل مع الدعم إذا استمرت المشكلة.',
});

function isKnownRejectionCategory(category) {
  return Object.values(KYC_REJECTION_CATEGORIES).includes(String(category || '').trim());
}

function normalizeRejectionCategory(category, fallback = null) {
  const normalized = String(category || '').trim().toLowerCase();
  if (isKnownRejectionCategory(normalized)) {
    return normalized;
  }
  return fallback;
}

function getUserSafeRejectionMessage(category) {
  const normalized = normalizeRejectionCategory(category);
  return normalized ? USER_SAFE_REJECTION_MESSAGES[normalized] || null : null;
}

function inferRejectionCategory(reason) {
  const normalized = String(reason || '').trim().toLowerCase();
  if (!normalized) return null;

  if (
    normalized.includes('fraud') ||
    normalized.includes('spoof') ||
    normalized.includes('tamper')
  ) {
    return KYC_REJECTION_CATEGORIES.fraudSuspected;
  }
  if (
    normalized.includes('document_face_not_detected') ||
    normalized.includes('id_blurry') ||
    normalized.includes('blurred_id') ||
    normalized.includes('cropped_id')
  ) {
    return KYC_REJECTION_CATEGORIES.idBlurry;
  }
  if (
    normalized.includes('document_invalid') ||
    normalized.includes('id_invalid') ||
    normalized.includes('unsupported_document')
  ) {
    return KYC_REJECTION_CATEGORIES.idInvalid;
  }
  if (
    normalized.includes('selfie_face_not_detected') ||
    normalized.includes('face_not_clear') ||
    normalized.includes('selfie_blurry')
  ) {
    return KYC_REJECTION_CATEGORIES.faceNotClear;
  }
  if (normalized.includes('face')) {
    return KYC_REJECTION_CATEGORIES.faceMismatch;
  }
  if (normalized.includes('document') || normalized.includes('id_')) {
    return KYC_REJECTION_CATEGORIES.idInvalid;
  }
  if (normalized.includes('selfie')) {
    return KYC_REJECTION_CATEGORIES.faceNotClear;
  }
  return null;
}

function getRetryActionForCategory(category) {
  switch (normalizeRejectionCategory(category)) {
    case KYC_REJECTION_CATEGORIES.idBlurry:
    case KYC_REJECTION_CATEGORIES.idInvalid:
      return 'documents';
    case KYC_REJECTION_CATEGORIES.faceNotClear:
      return 'selfie';
    case KYC_REJECTION_CATEGORIES.faceMismatch:
    case KYC_REJECTION_CATEGORIES.fraudSuspected:
    default:
      return 'both';
  }
}

function getProblemTypeForCategory(category) {
  switch (normalizeRejectionCategory(category)) {
    case KYC_REJECTION_CATEGORIES.idBlurry:
    case KYC_REJECTION_CATEGORIES.idInvalid:
      return 'document_issue';
    case KYC_REJECTION_CATEGORIES.faceNotClear:
      return 'selfie_issue';
    case KYC_REJECTION_CATEGORIES.faceMismatch:
      return 'face_mismatch';
    case KYC_REJECTION_CATEGORIES.fraudSuspected:
      return 'security_review';
    default:
      return 'unknown';
  }
}

function buildRejectionPayload({
  category,
  userSafeReason,
  internalReason,
} = {}) {
  const normalizedCategory =
    normalizeRejectionCategory(category) || inferRejectionCategory(internalReason);
  const safeMessage =
    String(userSafeReason || '').trim() ||
    getUserSafeRejectionMessage(normalizedCategory) ||
    null;

  return {
    rejectionCategory: normalizedCategory,
    rejectionReasonUserSafe: safeMessage,
    rejectionReasonInternal: internalReason || null,
  };
}

module.exports = {
  KYC_REJECTION_CATEGORIES,
  USER_SAFE_REJECTION_MESSAGES,
  normalizeRejectionCategory,
  getUserSafeRejectionMessage,
  inferRejectionCategory,
  getRetryActionForCategory,
  getProblemTypeForCategory,
  buildRejectionPayload,
};
