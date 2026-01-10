const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const Artisan = require('../models/artisan.model');
const Request = require('../models/request.model');
const VerificationCode = require('../models/verificationCode.model');
const Transaction = require('../models/transaction.model');
const Review = require('../models/review.model');
const Notification = require('../models/notification.model');
const { ApiError } = require('../errors/apiError');
const { dataResponse } = require('../utils/responder');
const { verificationCodeTemplate, passwordResetTemplate, welcomeTemplate } = require('../utils/emailTemplates');

function signToken(user) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  const tokenVersion = user?.tokenVersion || 0;
  const ttl = process.env.ACCESS_TTL_SEC ? Number(process.env.ACCESS_TTL_SEC) : 60 * 60; // default 1 hour
  return jwt.sign({ sub: String(user._id), kind: 'artisan', tokenVersion }, secret, { expiresIn: ttl });
}

function signRefreshToken(user) {
  const secret = process.env.REFRESH_SECRET || process.env.JWT_SECRET || 'dev-secret';
  const tokenVersion = user?.tokenVersion || 0;
  const ttl = process.env.REFRESH_TTL_SEC ? Number(process.env.REFRESH_TTL_SEC) : 60 * 60 * 24 * 7; // default 7 days
  return jwt.sign({ sub: String(user._id), kind: 'artisan', tokenVersion, type: 'refresh' }, secret, { expiresIn: ttl });
}

function getBearerToken(req) {
  const hdr = req.headers.authorization || '';
  const [type, token] = hdr.split(' ');
  if (type === 'Bearer' && token) return token;
  return null;
}

function addDays(d) { const t = new Date(); t.setDate(t.getDate() + d); return t; }
function addHours(h) { const t = new Date(); t.setHours(t.getHours() + h); return t; }

function createTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: /^(1|true|yes)$/i.test(process.env.SMTP_SECURE || ''),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

async function sendMail(to, subject, html) {
  const tx = createTransport();
  if (!tx) return { ok: false, reason: 'SMTP not configured' };
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await tx.sendMail({ from, to, subject, html });
  return { ok: true };
}

function saveBase64Image(dir, name, base64) {
  const m = base64.match(/^data:(.*?);base64,(.*)$/);
  const data = Buffer.from(m ? m[2] : base64, 'base64');
  const uploads = path.join(process.cwd(), 'uploads', dir);
  fs.mkdirSync(uploads, { recursive: true });
  const file = path.join(uploads, `${name}.jpg`);
  fs.writeFileSync(file, data);
  const rel = `/uploads/${dir}/${path.basename(file)}`;
  return rel;
}

// POST /api/artisans/signup
async function signup(req, res) {
  const { name, phone, email, profession, password } = req.body;
  const exists = await Artisan.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ] });
  if (exists) throw ApiError.conflict('Phone or email already registered');
  const hash = await bcrypt.hash(password, 10);
  const doc = await Artisan.create({ name, phone: phone || null, email: email || null, profession, password: hash });
  // create verification code
  if (email) {
    const code = (Math.floor(Math.random() * 900000) + 100000).toString();
  await VerificationCode.create({ artisanId: doc._id, code, type: 'signup', createdAt: new Date(), expiresAt: addHours(2) });
    const htmlContent = verificationCodeTemplate(code, name);
    const info = await sendMail(email, 'Verify your Usta account', htmlContent);
    if (!info.ok) console.warn('Mail not sent, dev code:', code);
  }
  const artisan = doc.toObject(); delete artisan.password;
  const token = signToken(doc);
  const refreshToken = signRefreshToken(doc);
  return res.status(201).json({ message: 'Signup successful. Please verify your email.', artisan, token, refreshToken });
}

// POST /api/artisans/login
async function login(req, res) {
  const { phone, email, password } = req.body;
  const user = await Artisan.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ], deleted: { $ne: true } });
  if (!user) throw ApiError.unauthorized('Invalid credentials');
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');
  if (user.suspended) throw ApiError.forbidden('Your account is suspended by admin');
  if (!user.verified) {
    if (user.email) {
      const code = (Math.floor(Math.random() * 900000) + 100000).toString();
      await VerificationCode.create({ artisanId: user._id, code, type: 'signup', createdAt: new Date(), expiresAt: addHours(2) });
      const htmlContent = verificationCodeTemplate(code, user.name);
      await sendMail(user.email, 'Verify your Usta account', htmlContent);
    }
    throw ApiError.forbidden('Account not approved. Verification code sent to your email if provided.');
  }
  const token = signToken(user);
  const refreshToken = signRefreshToken(user);
  await Artisan.updateOne({ _id: user._id }, { $set: { isOnline: true, unavailableUntil: null } });
  const artisan = user.toObject(); delete artisan.password;
  return res.json({ token, refreshToken, artisan });
}

// POST /api/artisan/resend-verification
async function resendVerification(req, res) {
  const { email, phone } = req.body || {};
  const user = await Artisan.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ] });
  if (!user) throw ApiError.notFound('Account not found');
  if (user.verified) throw ApiError.badRequest('Account already verified');
  if (user.email) {
    const code = (Math.floor(Math.random() * 900000) + 100000).toString();
    await VerificationCode.create({ artisanId: user._id, code, type: 'signup', createdAt: new Date(), expiresAt: addHours(2) });
    const htmlContent = verificationCodeTemplate(code, user.name);
    await sendMail(user.email, 'Verify your Usta account', htmlContent);
  }
  return res.json({ message: 'Verification code sent' });
}

// GET /api/artisans/me
async function me(req, res) {
  const artisan = req.user.toObject(); delete artisan.password;
  return res.json({ artisan });
}

// PUT /api/artisans/me
async function updateMe(req, res) {
  const allowed = ['name', 'phone', 'email', 'profession', 'description', 'address', 'status'];
  const update = {};
  for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
  if (req.body?.avatar !== undefined) {
    if (req.body.avatar === null || req.body.avatar === '') {
      if (req.user?.avatar) {
        const abs = path.join(process.cwd(), req.user.avatar.replace(/^\//, ''));
        fs.existsSync(abs) && fs.unlinkSync(abs);
      }
      update.avatar = null;
    } else if (typeof req.body.avatar === 'string') {
      const rel = req.body.avatar.startsWith('/uploads/')
          ? req.body.avatar
          : saveBase64Image('avatars', `${req.user._id}-${Date.now()}`, req.body.avatar);
      if (req.user?.avatar && req.user.avatar !== rel) {
        const abs = path.join(process.cwd(), req.user.avatar.replace(/^\//, ''));
        fs.existsSync(abs) && fs.unlinkSync(abs);
      }
      update.avatar = rel;
    }
  }
  if (update.phone) {
    const exists = await Artisan.findOne({ _id: { $ne: req.user._id }, phone: update.phone });
    if (exists) throw ApiError.conflict('Phone already used');
  }
  if (update.email) {
    const exists = await Artisan.findOne({ _id: { $ne: req.user._id }, email: update.email });
    if (exists) throw ApiError.conflict('Email already used');
  }
  await Artisan.updateOne({ _id: req.user._id }, { $set: update });
  return res.json({ message: 'Updated', update });
}

// PUT /api/artisans/location
async function setLocation(req, res) {
  const { lat, lng } = req.body;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw ApiError.badRequest('lat and lng are required');
  await Artisan.updateOne(
    { _id: req.user._id },
    { $set: { location: { type: 'Point', coordinates: [longitude, latitude] }, locationUpdatedAt: new Date() } },
  );
  return res.json({ message: 'Location updated', location: { lat: latitude, lng: longitude } });
}

// PUT /api/artisans/change-password
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const ok = await bcrypt.compare(currentPassword, req.user.password);
  if (!ok) throw ApiError.badRequest('Current password incorrect');
  const hash = await bcrypt.hash(newPassword, 10);
  await Artisan.updateOne({ _id: req.user._id }, { $set: { password: hash, lastLogoutAt: new Date() }, $inc: { tokenVersion: 1 } });
  return res.json({ message: 'Password changed' });
}

// POST /api/artisan/verify
async function verify(req, res) {
  const { email, phone, code } = req.body;
  const user = await Artisan.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ] });
  if (!user) throw ApiError.notFound('Account not found');
  const vc = await VerificationCode.findOne({ artisanId: user._id, code, type: 'signup' });
  if (!vc) throw ApiError.badRequest('Invalid code');
  // check expiry and remove expired codes immediately
  if (vc.expiresAt && vc.expiresAt < new Date()) {
    await VerificationCode.deleteOne({ _id: vc._id });
    throw ApiError.badRequest('Code expired');
  }
  await Artisan.updateOne({ _id: user._id }, { $set: { verified: true } });
  // delete the code after successful verification to prevent reuse
  await VerificationCode.deleteOne({ _id: vc._id });
  return res.json({ ok: true });
}

// POST /api/artisan/forgot-password
async function forgotPassword(req, res) {
  const { email, phone, code, newPassword } = req.body;
  const user = await Artisan.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ] });
  if (!user) throw ApiError.notFound('Account not found');
  if (!code && !newPassword) {
  const reset = (Math.floor(Math.random() * 900000) + 100000).toString();
  await VerificationCode.create({ artisanId: user._id, code: reset, type: 'reset', createdAt: new Date(), expiresAt: addHours(2) });
    if (user.email) {
      const htmlContent = passwordResetTemplate(reset, user.name);
      await sendMail(user.email, 'Reset your Usta password', htmlContent);
    }
    return res.json({ message: 'Reset code sent' });
  }
  if (!code || !newPassword) throw ApiError.badRequest('code and newPassword required');
  const vc = await VerificationCode.findOne({ artisanId: user._id, code, type: 'reset' });
  if (!vc) throw ApiError.badRequest('Invalid code');
  if (vc.expiresAt && vc.expiresAt < new Date()) {
    await VerificationCode.deleteOne({ _id: vc._id });
    throw ApiError.badRequest('Code expired');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await Artisan.updateOne({ _id: user._id }, { $set: { password: hash, lastLogoutAt: new Date() }, $inc: { tokenVersion: 1 } });
  // delete reset code after successful password change
  await VerificationCode.deleteOne({ _id: vc._id });
  return res.json({ message: 'Password updated' });
}

async function verifyResetCode(req, res) {
  const { email, phone, code } = req.body;
  const user = await Artisan.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ] });
  if (!user) throw ApiError.notFound('Account not found');
  if (!code) throw ApiError.badRequest('code required');
  const vc = await VerificationCode.findOne({ artisanId: user._id, code, type: 'reset' });
  if (!vc) throw ApiError.badRequest('Invalid code');
  if (vc.expiresAt && vc.expiresAt < new Date()) {
    await VerificationCode.deleteOne({ _id: vc._id });
    throw ApiError.badRequest('Code expired');
  }
  return res.json({ ok: true });
}

// POST /api/artisan/logout
async function logout(req, res) {
  await Artisan.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 }, $set: { lastLogoutAt: new Date(), isOnline: false } });
  return res.json({ ok: true, message: 'Logged out' });
}

// POST /api/artisan/refresh-token
async function refreshToken(req, res) {
  const bearer = getBearerToken(req);
  if (!bearer) return res.status(401).json({ error: 'Unauthorized', message: 'Refresh token required' });
  try {
    const payload = jwt.verify(bearer, process.env.REFRESH_SECRET || process.env.JWT_SECRET || 'dev-secret');
    if (!payload?.sub || payload.kind !== 'artisan' || payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
    }
    const user = await Artisan.findOne({ _id: payload.sub, deleted: { $ne: true } });
    if (!user) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
    const currentVersion = Number(user.tokenVersion || 0);
    const payloadVersion = Number(payload.tokenVersion || 0);
    if (payloadVersion !== currentVersion) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
    const issuedAt = payload.iat ? payload.iat * 1000 : 0;
    if (user.lastLogoutAt && issuedAt < user.lastLogoutAt.getTime()) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
    if (user.suspended) return res.status(403).json({ error: 'Forbidden', message: 'Your account is suspended by admin' });
    if (!user.verified) return res.status(403).json({ error: 'Forbidden', message: 'Your account is pending admin approval' });
    const updated = await Artisan.findOneAndUpdate(
      { _id: user._id },
      { $inc: { tokenVersion: 1 } },
      { new: true },
    );
    const newVersion = Number(updated.tokenVersion || currentVersion + 1);
    const userForToken = { ...updated.toObject(), tokenVersion: newVersion };
    const token = signToken(userForToken);
    const newRefreshToken = signRefreshToken(userForToken);
    return res.json({ token, refreshToken: newRefreshToken });
  } catch (err) {
    if (err?.name === 'TokenExpiredError' || err?.name === 'JsonWebTokenError' || err?.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired refresh token' });
    }
    console.error('refreshToken error', err);
    return res.status(500).json({ error: 'Server error', message: 'Failed to refresh token' });
  }
}

// GET /api/artisan/profile
async function getProfile(req, res) {
  const artisan = await Artisan.findById(req.user._id)
    .select('name phone email profession description address status isOnline unavailableUntil services portfolio pricing availabilitySlots location rating reviewsCount createdAt avatar');
  const profile = artisan ? artisan.toObject() : {};

  // Ensure defaults so response always contains data.profile
  profile.name = profile.name || '';
  profile.phone = profile.phone || '';
  profile.email = profile.email || '';
  profile.profession = profile.profession || '';
  profile.description = profile.description || '';
  profile.address = profile.address || '';
  profile.status = profile.status || 'available';
  profile.isOnline = !!profile.isOnline;
  profile.unavailableUntil = profile.unavailableUntil || null;
  profile.services = Array.isArray(profile.services) ? profile.services : [];
  profile.portfolio = Array.isArray(profile.portfolio) ? profile.portfolio : [];
  profile.pricing = Array.isArray(profile.pricing) ? profile.pricing : [];
  profile.availabilitySlots = Array.isArray(profile.availabilitySlots) ? profile.availabilitySlots : [];
  profile.location = profile.location || null;
  profile.avatar = profile.avatar || null;
  profile.createdAt = profile.createdAt || null;

  const artisanId = req.user._id;
  const [aggReview] = await Review.aggregate([
    { $match: { artisanId } },
    { $group: { _id: '$artisanId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const completedRequests = await Request.countDocuments({ artisanId, status: 'completed' });
  const stats = {
    portfolioCount: profile.portfolio.length,
    servicesCount: profile.services.length,
    completedRequests,
    avgRating: aggReview?.avgRating ? Number(aggReview.avgRating.toFixed(2)) : 0,
    reviewsCount: aggReview?.count || 0,
  };
  profile.rating = profile.rating || stats.avgRating;
  profile.reviewsCount = profile.reviewsCount || stats.reviewsCount;

  return res.json(dataResponse({ profile, stats }));
}

// PUT /api/artisan/profile
async function updateProfile(req, res) { return updateMe(req, res); }

// POST /api/artisan/profile/photo
async function uploadPhoto(req, res) {
  const avatar = req.body?.avatar ?? req.body?.photo;
  if (!avatar) return res.status(400).json({ error: 'avatar required' });
  const rel = saveBase64Image('avatars', `${req.user._id}-${Date.now()}`, avatar);
  if (req.user?.avatar && req.user.avatar !== rel) {
    const abs = path.join(process.cwd(), req.user.avatar.replace(/^\//, ''));
    fs.existsSync(abs) && fs.unlinkSync(abs);
  }
  await Artisan.updateOne({ _id: req.user._id }, { $set: { avatar: rel } });
  return res.json({ avatar: rel });
}

// POST /api/artisan/portfolio
async function addPortfolioItem(req, res) {
  const { image, description } = req.body;
  if (!image) throw ApiError.badRequest('image required');
  const existing = await Artisan.findById(req.user._id).select('portfolio');
  if (!existing) throw ApiError.notFound('Account not found');
  const currentCount = existing.portfolio?.length || 0;
  if (currentCount >= 10) throw ApiError.badRequest('Maximum 10 portfolio items');
  const rel = saveBase64Image('portfolio', `${req.user._id}-${Date.now()}`, image);
  const item = { _id: new mongoose.Types.ObjectId(), path: rel, description: description || '', createdAt: new Date() };
  await Artisan.updateOne({ _id: req.user._id }, { $push: { portfolio: item } });
  return res.status(201).json({ item });
}

// GET /api/artisan/portfolio
async function getPortfolio(req, res) {
  const doc = await Artisan.findById(req.user._id).select('portfolio');
  return res.json(dataResponse({ portfolio: doc?.portfolio || [] }));
}

// DELETE /api/artisan/portfolio/:id
async function deletePortfolioItem(req, res) {
  const { id } = req.params;
  const doc = await Artisan.findById(req.user._id).select('portfolio');
  const item = doc?.portfolio?.find(p => String(p._id) === String(id));
  await Artisan.updateOne({ _id: req.user._id }, { $pull: { portfolio: { _id: id } } });
  if (item?.path) {
    const abs = path.join(process.cwd(), item.path.replace(/^\//, ''));
    fs.existsSync(abs) && fs.unlinkSync(abs);
  }
  return res.json({ ok: true });
}

// PUT /api/artisan/status
async function updateStatus(req, res) {
  const { status } = req.body;
  if (!['available', 'busy'].includes(status)) throw ApiError.badRequest('Invalid status');
  await Artisan.updateOne({ _id: req.user._id }, { $set: { status } });
  return res.json({ ok: true });
}

// PUT /api/artisan/online
async function setOnline(req, res) {
  const { online } = req.body;
  if (online === undefined) throw ApiError.badRequest('online required');
  await Artisan.updateOne({ _id: req.user._id }, { $set: { isOnline: !!online, lastOnlineAt: new Date(), status: online ? 'available' : 'busy' } });
  return res.json(dataResponse({ online: !!online }));
}

// PUT /api/artisan/availability
async function setAvailability(req, res) {
  const { slots, unavailableUntil } = req.body || {};
  if (slots && !Array.isArray(slots)) throw ApiError.badRequest('slots must be array');
  const normalized = (slots || []).map((s) => ({
    dayOfWeek: Number(s.dayOfWeek),
    from: s.from,
    to: s.to,
  })).filter((s) => s.dayOfWeek >= 0 && s.dayOfWeek <= 6 && s.from && s.to);
  const update = {};
  if (slots) update.availabilitySlots = normalized;
  if (unavailableUntil !== undefined) update.unavailableUntil = unavailableUntil ? new Date(unavailableUntil) : null;
  if (!Object.keys(update).length) throw ApiError.badRequest('No changes');
  await Artisan.updateOne({ _id: req.user._id }, { $set: update });
  return res.json(dataResponse({ availabilitySlots: normalized, unavailableUntil: update.unavailableUntil || null }));
}

// GET /api/artisan/availability
async function getAvailability(req, res) {
  const doc = await Artisan.findById(req.user._id).select('availabilitySlots unavailableUntil isOnline status');
  return res.json(dataResponse({ availabilitySlots: doc?.availabilitySlots || [], unavailableUntil: doc?.unavailableUntil || null, online: !!doc?.isOnline, status: doc?.status }));
}

// POST /api/artisan/services
async function setServices(req, res) {
  const { services } = req.body;
  if (!Array.isArray(services)) throw ApiError.badRequest('services must be array');
  if (req.user.suspended) throw ApiError.forbidden('Account suspended by admin');
  if (!req.user.verified) throw ApiError.forbidden('Admin approval required before adding services');
  const normalized = services.map(name => ({ _id: new mongoose.Types.ObjectId(), name: String(name) }));
  await Artisan.updateOne({ _id: req.user._id }, { $set: { services: normalized } });
  return res.json({ services: normalized });
}

// GET /api/artisan/services
async function getServices(req, res) {
  const doc = await Artisan.findById(req.user._id).select('services');
  return res.json(dataResponse({ services: doc?.services || [] }));
}

// PUT /api/artisan/services/:id
async function updateService(req, res) {
  const { id } = req.params; const { name } = req.body;
  if (!name) throw ApiError.badRequest('name required');
  if (req.user.suspended) throw ApiError.forbidden('Account suspended by admin');
  if (!req.user.verified) throw ApiError.forbidden('Admin approval required before updating services');
  await Artisan.updateOne({ _id: req.user._id, 'services._id': id }, { $set: { 'services.$.name': String(name) } });
  return res.json({ ok: true });
}

// DELETE /api/artisan/services/:id
async function deleteService(req, res) {
  const { id } = req.params;
  if (req.user.suspended) throw ApiError.forbidden('Account suspended by admin');
  if (!req.user.verified) throw ApiError.forbidden('Admin approval required before deleting services');
  await Artisan.updateOne({ _id: req.user._id }, { $pull: { services: { _id: id } } });
  return res.json({ ok: true });
}

// POST /api/artisan/pricing
async function setPricing(req, res) {
  const { pricing } = req.body;
  if (!Array.isArray(pricing)) throw ApiError.badRequest('pricing must be array');
  if (req.user.suspended) throw ApiError.forbidden('Account suspended by admin');
  if (!req.user.verified) throw ApiError.forbidden('Admin approval required before adding pricing');
  const normalized = pricing.map(p => ({ _id: new Artisan()._id, serviceName: p.serviceName, min: Number(p.min), max: Number(p.max), currency: p.currency || 'EGP' }));
  await Artisan.updateOne({ _id: req.user._id }, { $set: { pricing: normalized } });
  return res.json({ pricing: normalized });
}

// GET /api/artisan/wallet
async function getWallet(req, res) {
  const result = await Transaction.aggregate([
    { $match: { artisanId: req.user._id } },
    { $group: { _id: null, balance: { $sum: { $subtract: ['$credit', '$debit'] } } } },
  ]);
  const balance = result[0]?.balance || 0;
  return res.json(dataResponse({ balance }));
}

// GET /api/artisan/wallet/history
async function getWalletHistory(req, res) {
  const rows = await Transaction.find({ artisanId: req.user._id }).sort({ createdAt: -1 }).limit(200);
  const transactions = rows.map((tx) => ({
    id: tx._id,
    type: tx.type,
    status: tx.status || 'done',
    method: tx.method || null,
    requestId: tx.requestId || null,
    credit: tx.credit || 0,
    debit: tx.debit || 0,
    amount: Number((tx.credit || 0) - (tx.debit || 0)),
    createdAt: tx.createdAt,
    couponCode: tx.couponCode,
    couponDiscount: tx.couponDiscount,
    finalAmount: tx.finalAmount,
  }));
  return res.json(dataResponse({ transactions }));
}

// GET /api/artisan/earnings
async function getEarnings(req, res) {
  const daily = await Transaction.aggregate([
    { $match: { artisanId: req.user._id, credit: { $gt: 0 } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$credit' } } },
    { $sort: { _id: 1 } },
  ]);
  const monthly = await Transaction.aggregate([
    { $match: { artisanId: req.user._id, credit: { $gt: 0 } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: '$credit' } } },
    { $sort: { _id: 1 } },
  ]);
  return res.json(dataResponse({ daily, monthly }));
}

// POST /api/artisan/withdraw
async function withdraw(req, res) {
  const amount = Number(req.body.amount || 0);
  if (!(amount > 0)) throw ApiError.badRequest('Invalid amount');
  const agg = await Transaction.aggregate([
    { $match: { artisanId: req.user._id } },
    { $group: { _id: null, balance: { $sum: { $subtract: ['$credit', '$debit'] } } } },
  ]);
  const balance = agg[0]?.balance || 0;
  if (amount > balance) throw ApiError.badRequest('Insufficient balance');
  await Transaction.create({ artisanId: req.user._id, credit: 0, debit: amount, type: 'withdraw', status: 'pending' });
  return res.json(dataResponse({ ok: true, requested: amount, balanceAfter: balance - amount }));
}

// POST /api/artisan/payment-method
async function addPaymentMethod(req, res) {
  const { type, details } = req.body; if (!['vodafoneCash', 'bank'].includes(type)) throw ApiError.badRequest('Invalid type');
  await Artisan.updateOne({ _id: req.user._id }, { $set: { paymentMethod: { type, details } } });
  return res.json(dataResponse({ ok: true }));
}

// GET /api/artisan/reviews
async function getReviews(req, res) {
  const reviews = await Review.aggregate([
    { $match: { artisanId: req.user._id } },
    {
      $lookup: {
        from: 'customers',
        localField: 'customerId',
        foreignField: '_id',
        as: 'customer',
      },
    },
    { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        rating: 1,
        comment: 1,
        reply: 1,
        repliedAt: 1,
        createdAt: 1,
        customer: {
          id: '$customer._id',
          name: '$customer.name',
          phone: '$customer.phone',
          email: '$customer.email',
          photo: '$customer.photo',
          createdAt: '$customer.createdAt',
          isOnline: '$customer.isOnline',
          blocked: '$customer.blocked',
          verified: '$customer.verified',
          settings: '$customer.settings',
          notifications: '$customer.notifications',
        },
      },
    },
    { $sort: { createdAt: -1 } },
  ]);
  return res.json(dataResponse({ reviews }));
}

// POST /api/artisan/reviews/:id/reply
async function replyReview(req, res) {
  const { id } = req.params; const { reply } = req.body; if (!reply) throw ApiError.badRequest('reply required');
  const r = await Review.updateOne({ _id: id, artisanId: req.user._id }, { $set: { reply, repliedAt: new Date() } });
  if (r.matchedCount === 0) throw ApiError.notFound('Review not found');
  return res.json(dataResponse({ ok: true }));
}

// GET /api/artisan/reviews/average
async function getAverage(req, res) {
  const agg = await Review.aggregate([
    { $match: { artisanId: req.user._id } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const average = Number(((agg[0]?.avg || 0).toFixed?.(2) || 0));
  const count = agg[0]?.count || 0;
  return res.json(dataResponse({ average, count }));
}

// PUT /api/artisan/notifications
async function updateNotificationSettings(req, res) {
  const { marketing, requests, chat } = req.body; const set = {};
  if (marketing !== undefined) set['notifications.marketing'] = !!marketing;
  if (requests !== undefined) set['notifications.requests'] = !!requests;
  if (chat !== undefined) set['notifications.chat'] = !!chat;
  if (!Object.keys(set).length) throw ApiError.badRequest('No changes');
  await Artisan.updateOne({ _id: req.user._id }, { $set: set });
  return res.json(dataResponse({ ok: true }));
}

// DELETE /api/artisan/account
async function deleteAccount(req, res) {
  const doc = await Artisan.findById(req.user._id);
  if (doc?.avatar) {
    const abs = path.join(process.cwd(), doc.avatar.replace(/^\//, ''));
    fs.existsSync(abs) && fs.unlinkSync(abs);
  }
  for (const p of doc?.portfolio || []) {
    const abs = path.join(process.cwd(), (p.path || '').replace(/^\//, ''));
    fs.existsSync(abs) && fs.unlinkSync(abs);
  }
  await Artisan.updateOne({ _id: req.user._id }, { $set: { deleted: true, deletedAt: new Date() } });
  return res.json(dataResponse({ ok: true }));
}

// Notifications
async function getNotifications(req, res) {
  const rows = await Notification.find({ artisanId: req.user._id }).sort({ createdAt: -1 }).limit(100);
  return res.json(dataResponse({ notifications: rows }));
}
async function markNotificationRead(req, res) {
  const { id } = req.params; await Notification.updateOne({ _id: id, artisanId: req.user._id }, { $set: { read: true, readAt: new Date() } });
  return res.json(dataResponse({ ok: true }));
}

module.exports = {
  signup,
  login,
  resendVerification,
  verify,
  forgotPassword,
  verifyResetCode,
  logout,
  me,
  getProfile,
  updateProfile,
  uploadPhoto,
  updateMe,
  setLocation,
  changePassword,
  addPortfolioItem,
  deletePortfolioItem,
  updateStatus,
  setServices,
  updateService,
  deleteService,
  setPricing,
  getWallet,
  getWalletHistory,
  getEarnings,
  withdraw,
  addPaymentMethod,
  getServices,
  getReviews,
  replyReview,
  getAverage,
  updateNotificationSettings,
  deleteAccount,
  getNotifications,
  markNotificationRead,
  setOnline,
  setAvailability,
  getAvailability,
  getPortfolio,
  refreshToken,
};
