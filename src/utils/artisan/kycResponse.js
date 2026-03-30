function toPlainObject(value) {
  if (!value) return null;
  if (typeof value.toObject === 'function') {
    return value.toObject();
  }
  if (typeof value.toJSON === 'function') {
    return value.toJSON();
  }
  return { ...value };
}

function sanitizeVerificationForAudience(verification, {
  audience = 'self',
} = {}) {
  if (!verification) return null;
  const plain = toPlainObject(verification) || {};

  delete plain.rejectionReasonInternal;

  if (audience !== 'admin') {
    delete plain.confidence;
    delete plain.checkedAt;
    delete plain.reviewedBy;
    delete plain.reviewedAt;
  }

  return plain;
}

function sanitizeArtisanForAudience(artisan, {
  audience = 'self',
} = {}) {
  if (!artisan) return null;
  const plain = toPlainObject(artisan) || {};

  delete plain.password;
  delete plain.tokenVersion;
  delete plain.lastLogoutAt;
  delete plain.idFrontImage;
  delete plain.idBackImage;
  delete plain.selfieImage;
  delete plain.rejectionReasonInternal;

  if (audience === 'public') {
    delete plain.identityVerified;
    delete plain.verificationStep;
    delete plain.verificationStatus;
    delete plain.verificationAttempts;
    delete plain.lastAttemptAt;
    delete plain.verificationFailureReason;
    delete plain.verificationConfidence;
    delete plain.verificationCheckedAt;
    delete plain.rejectionCategory;
    delete plain.rejectionReasonUserSafe;
    delete plain.reviewedBy;
    delete plain.reviewedAt;
  } else if (audience === 'self') {
    delete plain.verificationConfidence;
    delete plain.verificationCheckedAt;
    plain.hasIdImages = Boolean(artisan?.idFrontImage && artisan?.idBackImage);
    plain.hasSelfieImage = Boolean(artisan?.selfieImage);
  }

  return plain;
}

module.exports = {
  sanitizeVerificationForAudience,
  sanitizeArtisanForAudience,
};
