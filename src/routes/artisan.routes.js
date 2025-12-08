const express = require('express');
const { body, param, validationResult } = require('express-validator');
const ctrl = require('../controllers/artisan.controller');
const { auth } = require('../middlewares/auth');
const acomp = require('../controllers/artisan.complaints.controller');
const notif = require('../controllers/notifications.controller');

const router = express.Router();

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Validation error', details: errors.array() });
  next();
}

// Signup
router.post(
  '/api/artisan/signup',
  body('name').isString().isLength({ min: 2 }),
  body('profession').isString().isLength({ min: 2 }),
  body('password').isString().isLength({ min: 6 }),
  body('phone').optional().isString().isLength({ min: 6 }),
  body('email').optional().isEmail(),
  handleValidation,
  (req, res, next) => ctrl.signup(req, res).catch(next)
);

// Login
router.post(
  '/api/artisan/login',
  body('password').isString().isLength({ min: 6 }),
  body('phone').optional().isString(),
  body('email').optional().isEmail(),
  handleValidation,
  (req, res, next) => ctrl.login(req, res).catch(next)
);

// Verify
router.post(
  '/api/artisan/verify',
  body('code').isLength({ min: 6, max: 6 }),
  body('email').optional().isEmail(),
  body('phone').optional().isString(),
  handleValidation,
  (req, res, next) => ctrl.verify(req, res).catch(next)
);

// Forgot password
router.post(
  '/api/artisan/forgot-password',
  body('email').optional().isEmail(),
  body('phone').optional().isString(),
  body('code').optional().isLength({ min: 6, max: 6 }),
  body('newPassword').optional().isLength({ min: 6 }),
  handleValidation,
  (req, res, next) => ctrl.forgotPassword(req, res).catch(next)
);

router.post(
  '/api/artisan/forgot-password/verify-code',
  body('email').optional().isEmail(),
  body('phone').optional().isString(),
  body('code').isLength({ min: 6, max: 6 }),
  body().custom((_, { req }) => {
    if (!req.body.email && !req.body.phone) throw new Error('email or phone required');
    return true;
  }),
  handleValidation,
  (req, res, next) => ctrl.verifyResetCode(req, res).catch(next)
);

// Resend verification
router.post(
  '/api/artisan/resend-verification',
  body('email').optional().isEmail(),
  body('phone').optional().isString(),
  body().custom((_,{req}) => { if(!req.body.email && !req.body.phone) throw new Error('email or phone required'); return true; }),
  handleValidation,
  (req, res, next) => ctrl.resendVerification(req, res).catch(next)
);

// Logout
router.post('/api/artisan/logout', auth('artisan'), (req, res, next) => ctrl.logout(req, res).catch(next));
router.post('/api/artisan/refresh-token', (req, res, next) => ctrl.refreshToken(req, res).catch(next));

// Me
router.get('/api/artisan/me', auth('artisan'), (req, res, next) => ctrl.me(req, res).catch(next));

// Update me
router.put(
  '/api/artisan/me',
  auth('artisan'),
  body('name').optional().isString().isLength({ min: 2 }),
  body('phone').optional().isString().isLength({ min: 6 }),
  body('email').optional().isEmail(),
  body('profession').optional().isString().isLength({ min: 2 }),
  body('description').optional().isString().isLength({ min: 3 }),
  body('address').optional().isString().isLength({ min: 3 }),
  body('status').optional().isIn(['available', 'busy']),
  handleValidation,
  (req, res, next) => ctrl.updateMe(req, res).catch(next)
);

// Location
router.put(
  '/api/artisan/location',
  auth('artisan'),
  body('lat').isFloat({ min: -90, max: 90 }),
  body('lng').isFloat({ min: -180, max: 180 }),
  handleValidation,
  (req, res, next) => ctrl.setLocation(req, res).catch(next)
);

// Change password
router.put(
  '/api/artisan/change-password',
  auth('artisan'),
  body('currentPassword').isString().isLength({ min: 6 }),
  body('newPassword').isString().isLength({ min: 6 }),
  handleValidation,
  (req, res, next) => ctrl.changePassword(req, res).catch(next)
);

// Profile & Portfolio
router.get('/api/artisan/profile', auth('artisan'), (req, res, next) => ctrl.getProfile(req, res).catch(next));
router.put(
  '/api/artisan/profile',
  auth('artisan'),
  body('name').optional().isString().isLength({ min: 2 }),
  body('phone').optional().isString().isLength({ min: 6 }),
  body('email').optional().isEmail(),
  body('address').optional().isString().isLength({ min: 3 }),
  body('description').optional().isString().isLength({ min: 3 }),
  handleValidation,
  (req, res, next) => ctrl.updateProfile(req, res).catch(next)
);
router.post(
  '/api/artisan/portfolio',
  auth('artisan'),
  body('image').isString().isLength({ min: 10 }),
  body('description').optional().isString(),
  handleValidation,
  (req, res, next) => ctrl.addPortfolioItem(req, res).catch(next)
);
router.get('/api/artisan/portfolio', auth('artisan'), (req, res, next) => ctrl.getPortfolio(req, res).catch(next));
router.delete(
  '/api/artisan/portfolio/:id',
  auth('artisan'),
  param('id').isString().isLength({ min: 24, max: 24 }),
  handleValidation,
  (req, res, next) => ctrl.deletePortfolioItem(req, res).catch(next)
);

// Status
router.put('/api/artisan/status', auth('artisan'), body('status').isIn(['available','busy']), handleValidation, (req, res, next) => ctrl.updateStatus(req, res).catch(next));
router.put('/api/artisan/online', auth('artisan'), body('online').optional().isBoolean(), body('unavailableUntil').optional().isISO8601(), handleValidation, (req, res, next) => ctrl.setOnline(req, res).catch(next));
router.put('/api/artisan/availability', auth('artisan'), body('slots').optional().isArray(), body('unavailableUntil').optional().isISO8601(), handleValidation, (req, res, next) => ctrl.setAvailability(req, res).catch(next));
router.get('/api/artisan/availability', auth('artisan'), (req, res, next) => ctrl.getAvailability(req, res).catch(next));

// Services & Pricing
router.get('/api/artisan/services', auth('artisan'), (req, res, next) => ctrl.getServices(req, res).catch(next));
router.post('/api/artisan/services', auth('artisan'), body('services').isArray({ min: 1 }), body('services.*').isString().isLength({ min: 1 }), handleValidation, (req, res, next) => ctrl.setServices(req, res).catch(next));
router.put('/api/artisan/services/:id', auth('artisan'), param('id').isLength({ min: 24, max: 24 }), body('name').isString().isLength({ min: 1 }), handleValidation, (req, res, next) => ctrl.updateService(req, res).catch(next));
router.delete('/api/artisan/services/:id', auth('artisan'), param('id').isLength({ min: 24, max: 24 }), handleValidation, (req, res, next) => ctrl.deleteService(req, res).catch(next));
router.post(
  '/api/artisan/pricing',
  auth('artisan'),
  body('pricing').isArray({ min: 1 }),
  body('pricing.*.serviceName').isString().isLength({ min: 1 }),
  body('pricing.*.min').isFloat({ min: 0 }),
  body('pricing.*.max').isFloat({ min: 0 }),
  body('pricing.*.currency').optional().isString().isLength({ min: 1, max: 8 }),
  handleValidation,
  (req, res, next) => ctrl.setPricing(req, res).catch(next)
);

// Wallet & Earnings
router.get('/api/artisan/wallet', auth('artisan'), (req, res, next) => ctrl.getWallet(req, res).catch(next));
router.get('/api/artisan/wallet/history', auth('artisan'), (req, res, next) => ctrl.getWalletHistory(req, res).catch(next));
router.get('/api/artisan/earnings', auth('artisan'), (req, res, next) => ctrl.getEarnings(req, res).catch(next));
router.post('/api/artisan/withdraw', auth('artisan'), body('amount').isFloat({ gt: 0 }), handleValidation, (req, res, next) => ctrl.withdraw(req, res).catch(next));
router.post('/api/artisan/payment-method', auth('artisan'), body('type').isIn(['vodafoneCash','bank']), handleValidation, (req, res, next) => ctrl.addPaymentMethod(req, res).catch(next));

// Reviews & Ratings
router.get('/api/artisan/reviews', auth('artisan'), (req, res, next) => ctrl.getReviews(req, res).catch(next));
router.post('/api/artisan/reviews/:id/reply', auth('artisan'), param('id').isLength({ min: 24, max: 24 }), body('reply').isString().isLength({ min: 1 }), handleValidation, (req, res, next) => ctrl.replyReview(req, res).catch(next));
router.get('/api/artisan/reviews/average', auth('artisan'), (req, res, next) => ctrl.getAverage(req, res).catch(next));

// Notifications
router.get('/api/artisan/notifications', auth('artisan'), (req, res, next) => ctrl.getNotifications(req, res).catch(next));
router.put('/api/artisan/notifications/:id/read', auth('artisan'), param('id').isLength({ min: 24, max: 24 }), handleValidation, (req, res, next) => ctrl.markNotificationRead(req, res).catch(next));
// Update notification settings
router.put(
  '/api/artisan/notifications',
  auth('artisan'),
  body('marketing').optional().isBoolean(),
  body('requests').optional().isBoolean(),
  body('chat').optional().isBoolean(),
  handleValidation,
  (req, res, next) => ctrl.updateNotificationSettings(req, res).catch(next)
);
// FCM tokens
router.post('/api/artisan/notifications/fcm-token', auth('artisan'), body('token').isString().isLength({ min: 10 }), handleValidation, (req, res, next) => notif.saveArtisanToken(req, res).catch(next));
router.get('/api/artisan/notifications/fcm-token', auth('artisan'), (req, res, next) => notif.listArtisanTokens(req, res).catch(next));

// Delete account
router.delete('/api/artisan/account', auth('artisan'), (req, res, next) => ctrl.deleteAccount(req, res).catch(next));

// Complaints / Support
router.post('/api/artisan/complaints', auth('artisan'), body('issue').isString().isLength({ min: 3 }), body('customerId').optional().isLength({ min: 24, max: 24 }), body('requestId').optional().isLength({ min: 24, max: 24 }), body('type').optional().isString().isLength({ min: 2 }), handleValidation, (req, res, next) => acomp.createComplaint(req, res).catch(next));
router.get('/api/artisan/complaints', auth('artisan'), (req, res, next) => acomp.listComplaints(req, res).catch(next));
router.get('/api/artisan/complaints/:id', auth('artisan'), param('id').isLength({ min: 24, max: 24 }), handleValidation, (req, res, next) => acomp.getComplaint(req, res).catch(next));
router.post('/api/artisan/complaints/:id/messages', auth('artisan'), param('id').isLength({ min: 24, max: 24 }), body('message').isString().isLength({ min: 1 }), handleValidation, (req, res, next) => acomp.postMessage(req, res).catch(next));

module.exports = router;
