const express = require('express');
const { body, param, validationResult } = require('express-validator');
const ctrl = require('../controllers/customer.controller');
const explore = require('../controllers/explore.controller');
const creq = require('../controllers/customer.requests.controller');
const crev = require('../controllers/customer.reviews.controller');
const fav = require('../controllers/customer.favorites.controller');
const cnot = require('../controllers/customer.notifications.controller');
const cans = require('../controllers/customer.analytics.controller');
const pay = require('../controllers/customer.payments.controller');
const ccomp = require('../controllers/customer.complaints.controller');
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

// Logout
router.post('/api/customer/logout', auth('customer'), (req, res, next) => ctrl.logout(req, res).catch(next));

// Verify & Forgot password
router.post('/api/customer/verify', body('code').isLength({ min: 6, max: 6 }), body('email').optional().isEmail(), body('phone').optional().isString(), handleValidation, (req, res, next) => ctrl.verify(req, res).catch(next));
router.post('/api/customer/forgot-password', body('email').optional().isEmail(), body('phone').optional().isString(), body('code').optional().isLength({ min: 6, max: 6 }), body('newPassword').optional().isLength({ min: 6 }), handleValidation, (req, res, next) => ctrl.forgotPassword(req, res).catch(next));

// Me
router.get('/api/customer/me', auth('customer'), (req, res, next) => ctrl.me(req, res).catch(next));

// Profile
router.get('/api/customer/profile', auth('customer'), (req, res, next) => ctrl.getProfile(req, res).catch(next));
router.put('/api/customer/profile', auth('customer'), body('name').optional().isString().isLength({ min: 2 }), body('phone').optional().isString().isLength({ min: 6 }), body('email').optional().isEmail(), body('address').optional().isString().isLength({ min: 3 }), handleValidation, (req, res, next) => ctrl.updateProfile(req, res).catch(next));
router.post('/api/customer/profile/photo', auth('customer'), body('photo').isString().isLength({ min: 10 }), handleValidation, (req, res, next) => ctrl.uploadPhoto(req, res).catch(next));
router.delete('/api/customer/account', auth('customer'), (req, res, next) => ctrl.deleteAccount(req, res).catch(next));

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

// Settings & Preferences
router.put('/api/customer/notifications', auth('customer'), body('marketing').optional().isBoolean(), body('requests').optional().isBoolean(), body('chat').optional().isBoolean(), handleValidation, (req, res, next) => ctrl.updateNotificationSettings(req, res).catch(next));
router.put('/api/customer/language', auth('customer'), body('language').isIn(['ar','en']), handleValidation, (req, res, next) => ctrl.setLanguage(req, res).catch(next));
router.put('/api/customer/theme', auth('customer'), body('theme').isIn(['dark','light']), handleValidation, (req, res, next) => ctrl.setTheme(req, res).catch(next));
router.put('/api/customer/online', auth('customer'), body('online').optional().isBoolean(), body('unavailableUntil').optional().isISO8601(), handleValidation, (req, res, next) => ctrl.setOnline(req, res).catch(next));
router.put('/api/customer/availability', auth('customer'), body('slots').isArray(), handleValidation, (req, res, next) => ctrl.setAvailability(req, res).catch(next));
router.get('/api/customer/online', auth('customer'), (req, res, next) => ctrl.getOnlineStatus(req, res).catch(next));

// Explore & Search (public)
router.get('/api/categories', (req, res, next) => explore.getCategories(req, res).catch(next));
router.get('/api/artisans/search', (req, res, next) => explore.searchArtisans(req, res).catch(next));
router.get('/api/artisans/:id', (req, res, next) => explore.getArtisanDetails(req, res).catch(next));
router.get('/api/artisans/nearby', (req, res, next) => explore.nearbyArtisans(req, res).catch(next));
router.get('/api/artisans/top-rated', (req, res, next) => explore.topRatedArtisans(req, res).catch(next));
router.get('/api/artisans/area', (req, res, next) => explore.artisansInArea(req, res).catch(next));

// Requests
router.post(
  '/api/customer/requests',
  auth('customer'),
  body('serviceType').optional().isString().isLength({ min: 1 }),
  body('artisanId').optional().isLength({ min: 24, max: 24 }),
  body('lat').optional().isFloat({ min: -90, max: 90 }),
  body('lng').optional().isFloat({ min: -180, max: 180 }),
  body('address').optional().isString().isLength({ min: 3 }),
  handleValidation,
  (req, res, next) => creq.createRequest(req, res).catch(next)
);
router.post('/api/customer/requests/:id/images', auth('customer'), body('images').isArray({ min: 1 }), (req, res, next) => creq.addImages(req, res).catch(next));
router.get('/api/customer/requests/active', auth('customer'), (req, res, next) => creq.getActive(req, res).catch(next));
router.get('/api/customer/requests/history', auth('customer'), (req, res, next) => creq.getHistory(req, res).catch(next));
router.get('/api/customer/requests/:id', auth('customer'), param('id').isLength({ min: 24, max: 24 }), handleValidation, (req, res, next) => creq.getRequestDetail(req, res).catch(next));
router.get('/api/customer/requests/:id/timeline', auth('customer'), param('id').isLength({ min: 24, max: 24 }), handleValidation, (req, res, next) => creq.getRequestTimeline(req, res).catch(next));
router.delete('/api/customer/requests/:id/cancel', auth('customer'), param('id').isLength({ min: 24, max: 24 }), body('reason').optional().isString().isLength({ min: 1 }), handleValidation, (req, res, next) => creq.cancelRequest(req, res).catch(next));

// Reviews (customer side)
router.post('/api/customer/reviews/:artisanId', auth('customer'), body('rating').isInt({ min: 1, max: 5 }), (req, res, next) => crev.createReview(req, res).catch(next));
router.put('/api/customer/reviews/:id', auth('customer'), (req, res, next) => crev.updateReview(req, res).catch(next));
router.delete('/api/customer/reviews/:id', auth('customer'), (req, res, next) => crev.deleteReview(req, res).catch(next));
router.get('/api/customer/reviews', auth('customer'), (req, res, next) => crev.myReviews(req, res).catch(next));

// Favorites & History
router.post('/api/customer/favorites/:artisanId', auth('customer'), (req, res, next) => fav.addFavorite(req, res).catch(next));
router.get('/api/customer/favorites', auth('customer'), (req, res, next) => fav.listFavorites(req, res).catch(next));
router.delete('/api/customer/favorites/:artisanId', auth('customer'), (req, res, next) => fav.removeFavorite(req, res).catch(next));
router.get('/api/customer/history', auth('customer'), async (req, res, next) => { try { const View = require('../models/view.model'); const rows = await View.find({ customerId: req.user._id }).sort({ createdAt: -1 }).limit(100); res.json({ views: rows }); } catch (e) { next(e); } });

// Payments & Wallet
router.post('/api/payment', auth('customer'), body('requestId').isLength({ min: 24, max: 24 }), body('amount').isFloat({ gt: 0 }), handleValidation, (req, res, next) => pay.createPayment(req, res).catch(next));
router.get('/api/payment/:id/receipt', auth('customer'), (req, res, next) => pay.getReceipt(req, res).catch(next));
router.get('/api/customer/wallet', auth('customer'), (req, res, next) => pay.wallet(req, res).catch(next));
router.post('/api/customer/wallet/recharge', auth('customer'), body('amount').isFloat({ gt: 0 }), handleValidation, (req, res, next) => pay.recharge(req, res).catch(next));
router.get('/api/customer/wallet/history', auth('customer'), (req, res, next) => pay.history(req, res).catch(next));

// Notifications
router.get('/api/customer/notifications', auth('customer'), (req, res, next) => cnot.getNotifications(req, res).catch(next));
router.put('/api/customer/notifications/:id/read', auth('customer'), (req, res, next) => cnot.markRead(req, res).catch(next));
router.delete('/api/customer/notifications/:id', auth('customer'), (req, res, next) => cnot.remove(req, res).catch(next));

// Complaints / Support
router.post('/api/customer/complaints', auth('customer'), body('issue').isString().isLength({ min: 3 }), body('artisanId').optional().isLength({ min: 24, max: 24 }), body('requestId').optional().isLength({ min: 24, max: 24 }), body('type').optional().isString().isLength({ min: 2 }), handleValidation, (req, res, next) => ccomp.createComplaint(req, res).catch(next));
router.get('/api/customer/complaints', auth('customer'), (req, res, next) => ccomp.listComplaints(req, res).catch(next));
router.get('/api/customer/complaints/:id', auth('customer'), param('id').isLength({ min: 24, max: 24 }), handleValidation, (req, res, next) => ccomp.getComplaint(req, res).catch(next));
router.post('/api/customer/complaints/:id/messages', auth('customer'), param('id').isLength({ min: 24, max: 24 }), body('message').isString().isLength({ min: 1 }), handleValidation, (req, res, next) => ccomp.postMessage(req, res).catch(next));

// Analytics
router.get('/api/customer/dashboard', auth('customer'), (req, res, next) => cans.dashboard(req, res).catch(next));
router.get('/api/customer/stats', auth('customer'), (req, res, next) => cans.stats(req, res).catch(next));

// Marketing & Extras
router.get('/api/customer/coupons', (req, res, next) => require('../controllers/customer.marketing.controller').coupons(req, res).catch(next));
router.post('/api/customer/coupons/apply', auth('customer'), body('code').isString().isLength({ min: 2 }), handleValidation, (req, res, next) => require('../controllers/customer.marketing.controller').applyCoupon(req, res).catch(next));
router.post('/api/customer/referral', auth('customer'), body('code').isString().isLength({ min: 3 }), handleValidation, (req, res, next) => require('../controllers/customer.marketing.controller').referral(req, res).catch(next));
router.get('/api/customer/rewards', auth('customer'), (req, res, next) => require('../controllers/customer.marketing.controller').rewards(req, res).catch(next));
router.get('/api/customer/recommendations', auth('customer'), (req, res, next) => require('../controllers/customer.marketing.controller').recommendations(req, res).catch(next));
router.get('/api/customer/live-map', auth('customer'), (req, res, next) => require('../controllers/customer.marketing.controller').liveMap(req, res).catch(next));
router.get('/api/customer/ai-feedback', auth('customer'), (req, res, next) => require('../controllers/customer.marketing.controller').aiFeedback(req, res).catch(next));

module.exports = router;
