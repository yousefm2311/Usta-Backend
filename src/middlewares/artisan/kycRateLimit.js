const rateLimit = require('express-rate-limit');
const { normalizeVerificationState } = require('../../utils/artisan/kycState');
const { ipKeyGenerator } = rateLimit;

function getWindowMs() {
  return Math.max(
    60 * 1000,
    Number(process.env.KYC_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  );
}

function buildKycRateLimiter({
  action,
  max,
}) {
  return rateLimit({
    windowMs: getWindowMs(),
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator(req) {
      return `kyc:${action}:${req.user?._id || ipKeyGenerator(req.ip || '')}`;
    },
    handler(req, res) {
      const verification = normalizeVerificationState(req.user || {});
      const retryAfterSec = Math.max(
        1,
        Math.ceil((req.rateLimit?.resetTime
          ? req.rateLimit.resetTime.getTime() - Date.now()
          : getWindowMs()) / 1000),
      );
      return res.status(429).json({
        error: 'Too many verification attempts',
        message: 'عدد المحاولات كبير جدًا. يرجى الانتظار ثم إعادة المحاولة.',
        code: 'kyc_rate_limit_exceeded',
        details: {
          domain: 'kyc',
          ...verification,
          action,
          limit: max,
          cooldownRemaining: retryAfterSec,
          retryAfterSec,
          availableRetryAt: new Date(Date.now() + retryAfterSec * 1000).toISOString(),
        },
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString(),
      });
    },
  });
}

const uploadIdRateLimit = buildKycRateLimiter({
  action: 'upload_id',
  max: Math.max(1, Number(process.env.KYC_UPLOAD_ID_RATE_LIMIT_MAX) || 6),
});

const uploadSelfieRateLimit = buildKycRateLimiter({
  action: 'upload_selfie',
  max: Math.max(1, Number(process.env.KYC_UPLOAD_SELFIE_RATE_LIMIT_MAX) || 8),
});

module.exports = {
  uploadIdRateLimit,
  uploadSelfieRateLimit,
};
