const rateLimit = require('express-rate-limit');

const adminRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Too many requests',
      code: 429,
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  },
});

module.exports = { adminRateLimit };
