function requireVerifiedArtisan(req, res, next) {
  // Artisan KYC is disabled product-wide. Keep this middleware as a pass-through
  // so existing route wiring stays stable while verification no longer blocks
  // services, pricing, requests, wallet, earnings, or withdrawals.
  next();
}

module.exports = {
  requireVerifiedArtisan,
};
