const { ApiError } = require('../../errors/apiError');
const {
  getCurrentVerificationStatus,
  isApprovedStatus,
  normalizeVerificationState,
} = require('../../utils/artisan/kycState');

function requireVerifiedArtisan(req, res, next) {
  const status = getCurrentVerificationStatus(req.user);
  if (!isApprovedStatus(status)) {
    return next(
      ApiError.forbidden(
        'Complete identity verification to continue.',
        {
          domain: 'kyc',
          ...normalizeVerificationState(req.user),
          verificationStatus: status,
        },
        'kyc_verification_required',
      ),
    );
  }
  next();
}

module.exports = {
  requireVerifiedArtisan,
};
