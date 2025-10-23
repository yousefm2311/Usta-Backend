const express = require('express');
const { body, validationResult } = require('express-validator');
const ctrl = require('../controllers/customer.controller');
const { auth } = require('../middlewares/auth');

const router = express.Router();

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation error', details: errors.array() });
  next();
}

// Signup
router.post(
  '/api/customer/signup',
  body('name').isString().isLength({ min: 2 }),
  body('password').isString().isLength({ min: 6 }),
  body('phone').optional().isString().isLength({ min: 6 }),
  body('email').optional().isEmail(),
  handleValidation,
  (req, res, next) => ctrl.signup(req, res).catch(next)
);

// Login
router.post(
  '/api/customer/login',
  body('password').isString().isLength({ min: 6 }),
  body('phone').optional().isString(),
  body('email').optional().isEmail(),
  handleValidation,
  (req, res, next) => ctrl.login(req, res).catch(next)
);

// Verify & Forgot password
router.post('/api/customer/verify', body('code').isLength({ min: 6, max: 6 }), body('email').optional().isEmail(), body('phone').optional().isString(), handleValidation, (req, res, next) => ctrl.verify(req, res).catch(next));
router.post('/api/customer/forgot-password', body('email').optional().isEmail(), body('phone').optional().isString(), body('code').optional().isLength({ min: 6, max: 6 }), body('newPassword').optional().isLength({ min: 6 }), handleValidation, (req, res, next) => ctrl.forgotPassword(req, res).catch(next));

// Me
router.get('/api/customer/me', auth('customer'), (req, res, next) => ctrl.me(req, res).catch(next));

// Update me
router.put(
  '/api/customer/me',
  auth('customer'),
  body('name').optional().isString().isLength({ min: 2 }),
  body('phone').optional().isString().isLength({ min: 6 }),
  body('email').optional().isEmail(),
  body('address').optional().isString().isLength({ min: 3 }),
  handleValidation,
  (req, res, next) => ctrl.updateMe(req, res).catch(next)
);

// Change password
router.put(
  '/api/customer/change-password',
  auth('customer'),
  body('currentPassword').isString().isLength({ min: 6 }),
  body('newPassword').isString().isLength({ min: 6 }),
  handleValidation,
  (req, res, next) => ctrl.changePassword(req, res).catch(next)
);

module.exports = router;
