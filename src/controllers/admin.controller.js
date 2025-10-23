const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ApiError } = require('../errors/apiError');
const Admin = require('../models/admin.model');
const Customer = require('../models/customer.model');
const Artisan = require('../models/artisan.model');
const Category = require('../models/category.model');
const Request = require('../models/request.model');
const Report = require('../models/report.model');
const Transaction = require('../models/transaction.model');
const Review = require('../models/review.model');
const Notification = require('../models/notification.model');
const Setting = require('../models/settings.model');

function signAdmin(admin) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign({ sub: String(admin._id), role: admin.role, kind: 'admin' }, secret, { expiresIn: '8h' });
}

// Auth & Access
async function adminLogin(req, res) {
  const { email, password } = req.body || {};
  const admin = await Admin.findOne({ email, deleted: { $ne: true } });
  if (!admin) throw ApiError.unauthorized('Invalid credentials');
  const ok = await bcrypt.compare(password, admin.password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');
  return res.json({ token: signAdmin(admin), admin: { _id: admin._id, name: admin.name, email: admin.email, role: admin.role } });
}

async function adminCreate(req, res) {
  const { name, email, password, role } = req.body || {};
  const exists = await Admin.findOne({ email }); if (exists) throw ApiError.conflict('Email already used');
  const hash = await bcrypt.hash(password, 10);
  const doc = await Admin.create({ name, email, password: hash, role: role || 'viewer' });
  return res.status(201).json({ admin: { _id: doc._id, name: doc.name, email: doc.email, role: doc.role } });
}

async function adminChangePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  const ok = await bcrypt.compare(currentPassword, req.admin.password);
  if (!ok) throw ApiError.badRequest('Current password incorrect');
  const hash = await bcrypt.hash(newPassword, 10);
  await Admin.updateOne({ _id: req.admin._id }, { $set: { password: hash } });
  return res.json({ message: 'Password changed' });
}

async function adminLogout(req, res) { return res.json({ ok: true }); }
async function adminVerifyRole(req, res) { return res.json({ role: req.admin.role, admin: { _id: req.admin._id, name: req.admin.name, email: req.admin.email } }); }

// Customers Management
async function listCustomers(req, res) {
  const rows = await Customer.find({}).select('-password').limit(200).sort({ createdAt: -1 });
  return res.json({ customers: rows });
}
async function getCustomer(req, res) {
  const row = await Customer.findById(req.params.id).select('-password');
  if (!row) throw ApiError.notFound('Not found');
  return res.json({ customer: row });
}
async function blockCustomer(req, res) {
  const { id } = req.params; const { blocked } = req.body || {};
  await Customer.updateOne({ _id: id }, { $set: { blocked: !!blocked } });
  return res.json({ ok: true });
}
async function deleteCustomer(req, res) {
  const { id } = req.params; await Customer.updateOne({ _id: id }, { $set: { deleted: true } });
  return res.json({ ok: true });
}
async function searchCustomers(req, res) {
  const q = (req.query.query || '').trim();
  const rows = await Customer.find({ $or: [ { name: { $regex: q, $options: 'i' } }, { email: { $regex: q, $options: 'i' } }, { phone: { $regex: q, $options: 'i' } } ] }).select('-password').limit(100);
  return res.json({ customers: rows });
}

// Artisans Management
async function listArtisans(req, res) {
  const rows = await Artisan.find({}).select('-password').limit(200).sort({ createdAt: -1 });
  return res.json({ artisans: rows });
}
async function getArtisan(req, res) { const row = await Artisan.findById(req.params.id).select('-password'); if (!row) throw ApiError.notFound('Not found'); return res.json({ artisan: row }); }
async function approveArtisan(req, res) { await Artisan.updateOne({ _id: req.params.id }, { $set: { verified: true, suspended: false } }); return res.json({ ok: true }); }
async function rejectArtisan(req, res) { await Artisan.updateOne({ _id: req.params.id }, { $set: { deleted: true } }); return res.json({ ok: true }); }
async function updateArtisanStatus(req, res) { const { suspended } = req.body || {}; await Artisan.updateOne({ _id: req.params.id }, { $set: { suspended: !!suspended } }); return res.json({ ok: true }); }
async function filterArtisans(req, res) {
  const { category, rating } = req.query;
  const filter = {};
  if (category) filter.profession = { $regex: category, $options: 'i' };
  const base = await Artisan.find(filter).select('-password').limit(200);
  if (!rating) return res.json({ artisans: base });
  const min = Number(rating) || 0;
  const agg = await Review.aggregate([{ $group: { _id: '$artisanId', avg: { $avg: '$rating' } } }, { $match: { avg: { $gte: min } } }]);
  const allowed = new Set(agg.map(a => String(a._id)));
  const filtered = base.filter(a => allowed.has(String(a._id)));
  return res.json({ artisans: filtered });
}

// Categories
async function listCategories(req, res) { const rows = await Category.find({}).sort({ name: 1 }); return res.json({ categories: rows }); }
async function createCategory(req, res) { const doc = await Category.create({ name: req.body.name }); return res.status(201).json({ category: doc }); }
async function updateCategory(req, res) { await Category.updateOne({ _id: req.params.id }, { $set: { name: req.body.name } }); return res.json({ ok: true }); }
async function deleteCategory(req, res) { await Category.deleteOne({ _id: req.params.id }); return res.json({ ok: true }); }

// Requests
async function listRequests(req, res) { const rows = await Request.find({}).sort({ createdAt: -1 }).limit(200); return res.json({ requests: rows }); }
async function getRequest(req, res) { const row = await Request.findById(req.params.id); if (!row) throw ApiError.notFound('Not found'); return res.json({ request: row }); }
async function filterRequests(req, res) { const { status } = req.query; const rows = await Request.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(200); return res.json({ requests: rows }); }
async function deleteRequest(req, res) { await Request.deleteOne({ _id: req.params.id }); return res.json({ ok: true }); }
async function updateRequestStatus(req, res) { const { status } = req.body || {}; await Request.updateOne({ _id: req.params.id }, { $set: { status } }); return res.json({ ok: true }); }

// Reports
async function listReports(req, res) { const rows = await Report.find({}).sort({ createdAt: -1 }).limit(200); return res.json({ reports: rows }); }
async function getReport(req, res) { const row = await Report.findById(req.params.id); if (!row) throw ApiError.notFound('Not found'); return res.json({ report: row }); }
async function replyReport(req, res) { const { text } = req.body || {}; if (!text) throw ApiError.badRequest('text required'); await Report.updateOne({ _id: req.params.id }, { $push: { replies: { adminId: req.admin._id, text, createdAt: new Date() } } }); return res.json({ ok: true }); }
async function closeReport(req, res) { await Report.updateOne({ _id: req.params.id }, { $set: { status: 'closed' } }); return res.json({ ok: true }); }
async function filterReports(req, res) { const { type, status } = req.query; const flt = {}; if (type) flt.type = type; if (status) flt.status = status; const rows = await Report.find(flt).sort({ createdAt: -1 }).limit(200); return res.json({ reports: rows }); }

// Payments & Wallet
async function listPayments(req, res) { const rows = await Transaction.find({}).sort({ createdAt: -1 }).limit(200); return res.json({ payments: rows }); }
async function getPayment(req, res) { const row = await Transaction.findById(req.params.id); if (!row) throw ApiError.notFound('Not found'); return res.json({ payment: row }); }
async function filterPayments(req, res) {
  const { from, to, user } = req.query; const q = {};
  if (user) { q.$or = [ { customerId: user }, { artisanId: user } ]; }
  if (from || to) { q.createdAt = {}; if (from) q.createdAt.$gte = new Date(from); if (to) q.createdAt.$lte = new Date(to); }
  const rows = await Transaction.find(q).sort({ createdAt: -1 }).limit(200);
  return res.json({ payments: rows });
}
async function listWithdrawals(req, res) { const rows = await Transaction.find({ type: 'withdraw', status: 'pending' }).sort({ createdAt: -1 }); return res.json({ withdrawals: rows }); }
async function approveWithdrawal(req, res) { await Transaction.updateOne({ _id: req.params.id }, { $set: { status: 'approved', approvedAt: new Date(), approvedBy: req.admin._id } }); return res.json({ ok: true }); }
async function rejectWithdrawal(req, res) { await Transaction.updateOne({ _id: req.params.id }, { $set: { status: 'rejected', rejectedAt: new Date(), rejectedBy: req.admin._id } }); return res.json({ ok: true }); }

// Reviews
async function listReviews(req, res) { const rows = await Review.find({}).sort({ createdAt: -1 }).limit(200); return res.json({ reviews: rows }); }
async function filterReviews(req, res) { const { artisan, rating } = req.query; const q = {}; if (artisan) q.artisanId = artisan; if (rating) q.rating = Number(rating); const rows = await Review.find(q).sort({ createdAt: -1 }).limit(200); return res.json({ reviews: rows }); }
async function deleteReview(req, res) { await Review.deleteOne({ _id: req.params.id }); return res.json({ ok: true }); }
async function reviewStats(req, res) { const agg = await Review.aggregate([{ $group: { _id: '$artisanId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }, { $sort: { avg: -1 } }]); return res.json({ stats: agg }); }

// Analytics
async function adminDashboard(req, res) {
  const [customers, artisans, requests, completed, revenue] = await Promise.all([
    Customer.countDocuments({ deleted: { $ne: true } }),
    Artisan.countDocuments({ deleted: { $ne: true } }),
    Request.countDocuments({}),
    Request.countDocuments({ status: 'completed' }),
    Transaction.aggregate([{ $group: { _id: null, total: { $sum: '$debit' } } }]),
  ]);
  return res.json({ customers, artisans, requests, completedRequests: completed, totalRevenue: revenue[0]?.total || 0 });
}
async function analyticsDaily(req, res) {
  const dailyRequests = await Request.aggregate([{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  const dailySignups = await Customer.aggregate([{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  return res.json({ dailyRequests, dailySignups });
}
async function analyticsRevenue(req, res) { const monthly = await Transaction.aggregate([{ $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: '$debit' } } }, { $sort: { _id: 1 } }]); return res.json({ monthly }); }
async function analyticsActiveUsers(req, res) {
  const topCustomers = await Request.aggregate([{ $group: { _id: '$customerId', total: { $sum: 1 } } }, { $sort: { total: -1 } }, { $limit: 10 }]);
  const topArtisans = await Request.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: '$artisanId', total: { $sum: 1 } } }, { $sort: { total: -1 } }, { $limit: 10 }]);
  return res.json({ topCustomers, topArtisans });
}

// Notifications
async function adminSendNotification(req, res) {
  const { target, title, body } = req.body || {};
  if (!title || !body) throw ApiError.badRequest('title/body required');
  if (target === 'customers' || target === 'all') {
    await Notification.create({ type: 'admin_broadcast', title, body, createdAt: new Date() });
  }
  if (target === 'artisans' || target === 'all') {
    await Notification.create({ type: 'admin_broadcast', title, body, createdAt: new Date() });
  }
  return res.status(201).json({ ok: true });
}
async function adminListNotifications(req, res) { const rows = await Notification.find({ type: 'admin_broadcast' }).sort({ createdAt: -1 }); return res.json({ notifications: rows }); }
async function adminDeleteNotification(req, res) { await Notification.deleteOne({ _id: req.params.id }); return res.json({ ok: true }); }

// Settings
async function updateCommission(req, res) { const { commission } = req.body || {}; const doc = await Setting.findOneAndUpdate({ key: 'global' }, { $set: { commission, updatedAt: new Date() } }, { upsert: true, new: true }); return res.json({ settings: doc }); }
async function updateFeatures(req, res) { const features = req.body || {}; const doc = await Setting.findOneAndUpdate({ key: 'global' }, { $set: { features, updatedAt: new Date() } }, { upsert: true, new: true }); return res.json({ settings: doc }); }
async function securitySettings(req, res) { return res.json({ loginRestrictions: false, auditEnabled: true, lastAdminLogins: [] }); }

// AI & Automation (simple placeholders)
async function aiReviewsAnalysis(req, res) {
  const rows = await Review.find({}).sort({ createdAt: -1 }).limit(500);
  const posWords = ['great','good','excellent','perfect','amazing'];
  const negWords = ['bad','poor','terrible','awful','worst'];
  let pos = 0, neg = 0, neutral = 0;
  for (const r of rows) {
    const c = (r.comment || '').toLowerCase();
    const hasPos = posWords.some(w => c.includes(w));
    const hasNeg = negWords.some(w => c.includes(w));
    if (hasPos && !hasNeg) pos++; else if (hasNeg && !hasPos) neg++; else neutral++;
  }
  return res.json({ total: rows.length, positive: pos, negative: neg, neutral });
}
async function aiTopArtisans(req, res) {
  const agg = await Review.aggregate([{ $group: { _id: '$artisanId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }, { $sort: { avg: -1, count: -1 } }, { $limit: 10 }]);
  return res.json({ top: agg });
}
async function aiFraudDetection(req, res) {
  const cancelAgg = await Request.aggregate([{ $group: { _id: '$customerId', cancelled: { $sum: { $cond: [ { $eq: ['$status','cancelled'] }, 1, 0 ] } }, total: { $sum: 1 } } }, { $project: { rate: { $cond: [ { $eq: ['$total', 0] }, 0, { $divide: ['$cancelled','$total'] } ] } } }, { $match: { rate: { $gt: 0.5 } } }, { $sort: { rate: -1 } }]);
  return res.json({ suspiciousCustomers: cancelAgg });
}

module.exports = {
  adminLogin, adminCreate, adminChangePassword, adminLogout, adminVerifyRole,
  listCustomers, getCustomer, blockCustomer, deleteCustomer, searchCustomers,
  listArtisans, getArtisan, approveArtisan, rejectArtisan, updateArtisanStatus, filterArtisans,
  listCategories, createCategory, updateCategory, deleteCategory,
  listRequests, getRequest, filterRequests, deleteRequest, updateRequestStatus,
  listReports, getReport, replyReport, closeReport, filterReports,
  listPayments, getPayment, filterPayments, listWithdrawals, approveWithdrawal, rejectWithdrawal,
  listReviews, filterReviews, deleteReview, reviewStats,
  adminDashboard, analyticsDaily, analyticsRevenue, analyticsActiveUsers,
  adminSendNotification, adminListNotifications, adminDeleteNotification,
  updateCommission, updateFeatures, securitySettings,
  aiReviewsAnalysis, aiTopArtisans, aiFraudDetection,
};

