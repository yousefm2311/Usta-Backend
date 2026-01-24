const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { adminAuth, requireRole } = require('../middlewares/admin/adminAuth');
const { adminRateLimit } = require('../middlewares/admin/adminRateLimit');
const ctrl = require('../controllers/banner.controller');

const router = express.Router();

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation error',
      message: 'Validation error',
      code: 400,
      details: errors.array(),
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  }
  next();
}

function isDateLike(value) {
  if (value === null || value === undefined || value === '') return true;
  return !Number.isNaN(Date.parse(value));
}

const actionTypes = ['none', 'open_url', 'open_screen', 'apply_coupon'];
const userTypes = ['all', 'new_users', 'returning_users'];

const createValidators = [
  body('title').isString().trim().isLength({ min: 1 }).escape(),
  body('subtitle').optional().isString().trim().isLength({ min: 1 }).escape(),
  body('image').optional().isURL(),
  body('gradientColors').optional().isArray(),
  body('gradientColors.*').optional().isString().matches(/^#([0-9a-fA-F]{6})$/),
  body('actionType').optional().isIn(actionTypes),
  body('actionValue').optional().isString().trim(),
  body('isActive').optional().isBoolean().toBoolean(),
  body('startAt').optional().custom(isDateLike),
  body('endAt').optional().custom(isDateLike),
  body('priority').optional().isInt().toInt(),
  body('targetCities').optional().isArray(),
  body('targetCities.*').optional().isString().trim(),
  body('targetCategories').optional().isArray(),
  body('targetCategories.*').optional().isString().trim(),
  body('targetUserType').optional().isIn(userTypes),
  body().custom((_, { req }) => {
    if (req.body.actionType && req.body.actionType !== 'none' && !req.body.actionValue) {
      throw new Error('actionValue required for actionType');
    }
    if (req.body.actionType === 'open_url' && req.body.actionValue) {
      const url = String(req.body.actionValue || '');
      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch (e) {
        throw new Error('actionValue must be a valid URL');
      }
    }
    if (req.body.startAt && req.body.endAt) {
      const start = new Date(req.body.startAt);
      const end = new Date(req.body.endAt);
      if (end < start) throw new Error('endAt must be after startAt');
    }
    return true;
  }),
];

const updateValidators = [
  param('id').isLength({ min: 24, max: 24 }),
  body('title').optional().isString().trim().isLength({ min: 1 }).escape(),
  body('subtitle').optional().isString().trim().isLength({ min: 1 }).escape(),
  body('image').optional().isURL(),
  body('gradientColors').optional().isArray(),
  body('gradientColors.*').optional().isString().matches(/^#([0-9a-fA-F]{6})$/),
  body('actionType').optional().isIn(actionTypes),
  body('actionValue').optional().isString().trim(),
  body('isActive').optional().isBoolean().toBoolean(),
  body('startAt').optional().custom(isDateLike),
  body('endAt').optional().custom(isDateLike),
  body('priority').optional().isInt().toInt(),
  body('targetCities').optional().isArray(),
  body('targetCities.*').optional().isString().trim(),
  body('targetCategories').optional().isArray(),
  body('targetCategories.*').optional().isString().trim(),
  body('targetUserType').optional().isIn(userTypes),
  body().custom((_, { req }) => {
    if (req.body.actionType && req.body.actionType !== 'none' && !req.body.actionValue) {
      throw new Error('actionValue required for actionType');
    }
    if (req.body.actionType === 'open_url' && req.body.actionValue) {
      const url = String(req.body.actionValue || '');
      try {
        // eslint-disable-next-line no-new
        new URL(url);
      } catch (e) {
        throw new Error('actionValue must be a valid URL');
      }
    }
    if (req.body.startAt && req.body.endAt) {
      const start = new Date(req.body.startAt);
      const end = new Date(req.body.endAt);
      if (end < start) throw new Error('endAt must be after startAt');
    }
    return true;
  }),
];

// Admin (protected)
router.post(
  '/api/admin/banners',
  adminAuth,
  requireRole('editor', 'super'),
  adminRateLimit,
  createValidators,
  handleValidation,
  (req, res, next) => ctrl.createBanner(req, res, next)
);

router.put(
  '/api/admin/banners/:id',
  adminAuth,
  requireRole('editor', 'super'),
  adminRateLimit,
  updateValidators,
  handleValidation,
  (req, res, next) => ctrl.updateBanner(req, res, next)
);

router.delete(
  '/api/admin/banners/:id',
  adminAuth,
  requireRole('editor', 'super'),
  adminRateLimit,
  param('id').isLength({ min: 24, max: 24 }),
  handleValidation,
  (req, res, next) => ctrl.deleteBanner(req, res, next)
);

router.get(
  '/api/admin/banners',
  adminAuth,
  requireRole('viewer', 'editor', 'super'),
  adminRateLimit,
  query('page').optional().isInt({ min: 1 }),
  query('perPage').optional().isInt({ min: 1, max: 100 }),
  query('isActive').optional().isBoolean(),
  handleValidation,
  (req, res, next) => ctrl.listBanners(req, res, next)
);

// Customer (public)
router.get(
  '/api/banners/active',
  query('city').optional().isString().trim(),
  query('category').optional().isString().trim(),
  query('userType').optional().isIn(userTypes),
  handleValidation,
  (req, res, next) => ctrl.getActiveBanners(req, res, next)
);

module.exports = router;
