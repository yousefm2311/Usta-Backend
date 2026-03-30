const { ApiError } = require('../../errors/apiError');
const { getCurrentVerificationStatus, isApprovedStatus } = require('../../utils/artisan/kycState');

function requireVerifiedArtisan(req, res, next) {
  const status = getCurrentVerificationStatus(req.user);
  if (!isApprovedStatus(status)) {
    return next(
      new ApiError(
        403,
        'Complete identity verification to continue.',
        {
          verificationStatus: status,
        },
      ),
    );
  }
  next();
}

module.exports = {
  requireVerifiedArtisan,
};
