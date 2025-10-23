const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { adminAuth, requireRole } = require('../middlewares/adminAuth');
const ctrl = require('../controllers/admin.controller');

const router = express.Router();

function ok(req, res, next) { const e = validationResult(req); if (!e.isEmpty()) return res.status(400).json({ error: 'Validation error', details: e.array() }); next(); }

// Auth & Access
router.post('/api/admin/login', body('email').isEmail(), body('password').isLength({ min: 6 }), ok, (req, res, next) => ctrl.adminLogin(req, res).catch(next));
router.post('/api/admin/create', adminAuth, requireRole('super'), body('name').isLength({ min: 2 }), body('email').isEmail(), body('password').isLength({ min: 6 }), body('role').optional().isIn(['viewer','editor','super']), ok, (req, res, next) => ctrl.adminCreate(req, res).catch(next));
router.put('/api/admin/change-password', adminAuth, body('currentPassword').isLength({ min: 6 }), body('newPassword').isLength({ min: 6 }), ok, (req, res, next) => ctrl.adminChangePassword(req, res).catch(next));
router.post('/api/admin/logout', adminAuth, (req, res, next) => ctrl.adminLogout(req, res).catch(next));
router.get('/api/admin/verify-role', adminAuth, (req, res, next) => ctrl.adminVerifyRole(req, res).catch(next));

// Customers
router.get('/api/admin/customers', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.listCustomers(req, res).catch(next));
router.get('/api/admin/customers/search', adminAuth, requireRole('viewer','editor','super'), query('query').isLength({ min: 1 }), ok, (req, res, next) => ctrl.searchCustomers(req, res).catch(next));
router.get('/api/admin/customers/:id', adminAuth, requireRole('viewer','editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.getCustomer(req, res).catch(next));
router.put('/api/admin/customers/:id/block', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), body('blocked').isBoolean(), ok, (req, res, next) => ctrl.blockCustomer(req, res).catch(next));
router.delete('/api/admin/customers/:id', adminAuth, requireRole('super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.deleteCustomer(req, res).catch(next));

// Artisans
router.get('/api/admin/artisans', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.listArtisans(req, res).catch(next));
router.get('/api/admin/artisans/filter', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.filterArtisans(req, res).catch(next));
router.get('/api/admin/artisans/:id', adminAuth, requireRole('viewer','editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.getArtisan(req, res).catch(next));
router.put('/api/admin/artisans/:id/approve', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.approveArtisan(req, res).catch(next));
router.delete('/api/admin/artisans/:id/reject', adminAuth, requireRole('super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.rejectArtisan(req, res).catch(next));
router.put('/api/admin/artisans/:id/status', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), body('suspended').isBoolean(), ok, (req, res, next) => ctrl.updateArtisanStatus(req, res).catch(next));

// Categories
router.get('/api/admin/categories', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.listCategories(req, res).catch(next));
router.post('/api/admin/categories', adminAuth, requireRole('editor','super'), body('name').isLength({ min: 2 }), ok, (req, res, next) => ctrl.createCategory(req, res).catch(next));
router.put('/api/admin/categories/:id', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), body('name').isLength({ min: 2 }), ok, (req, res, next) => ctrl.updateCategory(req, res).catch(next));
router.delete('/api/admin/categories/:id', adminAuth, requireRole('super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.deleteCategory(req, res).catch(next));

// Requests
router.get('/api/admin/requests', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.listRequests(req, res).catch(next));
router.get('/api/admin/requests/filter', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.filterRequests(req, res).catch(next));
router.get('/api/admin/requests/:id', adminAuth, requireRole('viewer','editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.getRequest(req, res).catch(next));
router.delete('/api/admin/requests/:id', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.deleteRequest(req, res).catch(next));
router.put('/api/admin/requests/:id/status', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), body('status').isString(), ok, (req, res, next) => ctrl.updateRequestStatus(req, res).catch(next));

// Reports
router.get('/api/admin/reports', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.listReports(req, res).catch(next));
router.get('/api/admin/reports/filter', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.filterReports(req, res).catch(next));
router.get('/api/admin/reports/:id', adminAuth, requireRole('viewer','editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.getReport(req, res).catch(next));
router.post('/api/admin/reports/:id/reply', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), body('text').isLength({ min: 1 }), ok, (req, res, next) => ctrl.replyReport(req, res).catch(next));
router.put('/api/admin/reports/:id/close', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.closeReport(req, res).catch(next));

// Payments & Withdrawals
router.get('/api/admin/payments', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.listPayments(req, res).catch(next));
router.get('/api/admin/payments/filter', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.filterPayments(req, res).catch(next));
router.get('/api/admin/payments/:id', adminAuth, requireRole('viewer','editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.getPayment(req, res).catch(next));
router.get('/api/admin/withdrawals', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.listWithdrawals(req, res).catch(next));
router.put('/api/admin/withdrawals/:id/approve', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.approveWithdrawal(req, res).catch(next));
router.put('/api/admin/withdrawals/:id/reject', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.rejectWithdrawal(req, res).catch(next));

// Reviews
router.get('/api/admin/reviews', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.listReviews(req, res).catch(next));
router.get('/api/admin/reviews/filter', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.filterReviews(req, res).catch(next));
router.delete('/api/admin/reviews/:id', adminAuth, requireRole('editor','super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.deleteReview(req, res).catch(next));
router.get('/api/admin/reviews/stats', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.reviewStats(req, res).catch(next));

// Analytics
router.get('/api/admin/dashboard', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.adminDashboard(req, res).catch(next));
router.get('/api/admin/analytics/daily', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.analyticsDaily(req, res).catch(next));
router.get('/api/admin/analytics/revenue', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.analyticsRevenue(req, res).catch(next));
router.get('/api/admin/analytics/active-users', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.analyticsActiveUsers(req, res).catch(next));

// Notifications
router.post('/api/admin/notifications', adminAuth, requireRole('editor','super'), body('title').isLength({ min: 1 }), body('body').isLength({ min: 1 }), body('target').isIn(['customers','artisans','all']), ok, (req, res, next) => ctrl.adminSendNotification(req, res).catch(next));
router.get('/api/admin/notifications', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.adminListNotifications(req, res).catch(next));
router.delete('/api/admin/notifications/:id', adminAuth, requireRole('super'), param('id').isLength({ min: 24, max: 24 }), ok, (req, res, next) => ctrl.adminDeleteNotification(req, res).catch(next));

// Settings
router.put('/api/admin/settings/commission', adminAuth, requireRole('super'), body('commission').isFloat({ min: 0, max: 1 }), ok, (req, res, next) => ctrl.updateCommission(req, res).catch(next));
router.put('/api/admin/settings/features', adminAuth, requireRole('super'), (req, res, next) => ctrl.updateFeatures(req, res).catch(next));
router.get('/api/admin/settings/security', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.securitySettings(req, res).catch(next));

// AI
router.get('/api/admin/ai/reviews-analysis', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.aiReviewsAnalysis(req, res).catch(next));
router.get('/api/admin/ai/top-artisans', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.aiTopArtisans(req, res).catch(next));
router.get('/api/admin/ai/fraud-detection', adminAuth, requireRole('viewer','editor','super'), (req, res, next) => ctrl.aiFraudDetection(req, res).catch(next));

module.exports = router;

