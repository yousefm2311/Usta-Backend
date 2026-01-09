const { param, body } = require('express-validator');

const priceDecisionValidation = [
  param('id').isLength({ min: 24, max: 24 }),
  body('action').isIn(['accept', 'reject']),
  body('notes').optional().isString().isLength({ max: 500 }),
  body('price').optional().isFloat({ gt: 0 }),
];

const getRequestValidation = [
  param('id').isLength({ min: 24, max: 24 }),
];

module.exports = {
  priceDecisionValidation,
  getRequestValidation,
};
