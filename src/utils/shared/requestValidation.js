const { validationResult } = require('express-validator');

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'Validation error',
      message: 'Validation error',
      code: 'validation_error',
      details: errors.array(),
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  }
  return next();
}

function requireEmailOrPhone() {
  return (_, { req }) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (!email && !phone) {
      throw new Error('email or phone required');
    }
    return true;
  };
}

module.exports = {
  handleValidation,
  requireEmailOrPhone,
};
