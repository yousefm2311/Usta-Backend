const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Customer = require('../models/customer.model');
const VerificationCode = require('../models/verificationCode.model');
const { ApiError } = require('../errors/apiError');
const { dataResponse } = require('../utils/responder');
const { verificationCodeTemplate, passwordResetTemplate, welcomeTemplate } = require('../utils/emailTemplates');

function signToken(user) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  const tokenVersion = user?.tokenVersion || 0;
  const ttl = process.env.ACCESS_TTL_SEC ? Number(process.env.ACCESS_TTL_SEC) : 60 * 60; // default 1h
  return jwt.sign({ sub: String(user._id), kind: 'customer', tokenVersion }, secret, { expiresIn: ttl });
}

function signRefreshToken(user) {
  const secret = process.env.REFRESH_SECRET || process.env.JWT_SECRET || 'dev-secret';
  const tokenVersion = user?.tokenVersion || 0;
  const ttl = process.env.REFRESH_TTL_SEC ? Number(process.env.REFRESH_TTL_SEC) : 60 * 60 * 24 * 7; // default 7d
  return jwt.sign({ sub: String(user._id), kind: 'customer', tokenVersion, type: 'refresh' }, secret, { expiresIn: ttl });
}

function getBearerToken(req) {
  const hdr = req.headers.authorization || '';
  const [type, token] = hdr.split(' ');
  if (type === 'Bearer' && token) return token;
  return null;
}

function getRefreshTokenFromRequest(req) {
  // Prefer Authorization header, but fall back to body.refreshToken for clients that send it there.
  const fromHeader = getBearerToken(req);
  if (fromHeader) return fromHeader;
  if (typeof req.body?.refreshToken === 'string' && req.body.refreshToken.trim()) {
    return req.body.refreshToken.trim();
  }
  return null;
}

function buildCustomerProfile(user) {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : user;
  const { password, ...rest } = obj;
  const loc = (obj.location?.coordinates || []).length === 2
    ? { lat: obj.location.coordinates[1], lng: obj.location.coordinates[0] }
    : null;
  return {
    ...rest,
    address: obj.address || null,
    location: loc,
    photo: obj.photo || null,
    settings: obj.settings || {},
    notifications: obj.notifications || {},
    availabilitySlots: obj.availabilitySlots || [],
    isOnline: !!obj.isOnline,
    unavailableUntil: obj.unavailableUntil || null,
  };
}

// POST /api/customers/signup
async function signup(req, res) {
  const { name, phone, email, password } = req.body;
  const exists = await Customer.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ] });
  if (exists) throw ApiError.conflict('Phone or email already registered');
  const hash = await bcrypt.hash(password, 10);
  const doc = await Customer.create({ name, phone: phone || null, email: email || null, password: hash });
  if (email) {
    const code = (Math.floor(Math.random() * 900000) + 100000).toString();
  await VerificationCode.create({ customerId: doc._id, code, type: 'signup', createdAt: new Date(), expiresAt: new Date(Date.now() + 2*60*60*1000) });
    const htmlContent = verificationCodeTemplate(code, name);
    const tx = createTransport();
    if (tx) await tx.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: email, subject: 'Verify your Usta account', html: htmlContent });
  }
  const customer = doc.toObject(); delete customer.password;
  const token = signToken(doc);
  const refreshToken = signRefreshToken(doc);
  return res.status(201).json({ message: 'Signup successful. Please verify your email.', customer, token, refreshToken });
}

// POST /api/customers/login
async function login(req, res) {
  const { phone, email, password } = req.body;
  const user = await Customer.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ], deleted: { $ne: true } });
  if (!user) throw ApiError.unauthorized('Invalid credentials');
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');
  if (user.blocked) throw ApiError.forbidden('Your account is blocked by admin');
  if (!user.verified) {
    if (user.email) {
  const code = (Math.floor(Math.random() * 900000) + 100000).toString();
  await VerificationCode.create({ customerId: user._id, code, type: 'signup', createdAt: new Date(), expiresAt: new Date(Date.now() + 2*60*60*1000) });
      const htmlContent = verificationCodeTemplate(code, user.name);
      const tx = createTransport();
      if (tx) await tx.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: user.email, subject: 'Verify your Usta account', html: htmlContent });
    }
    throw ApiError.forbidden('Account not verified. Verification code sent to your email.');
  }
  const token = signToken(user);
  const refreshToken = signRefreshToken(user);
  await Customer.updateOne({ _id: user._id }, { $set: { isOnline: true, unavailableUntil: null } });
  const customer = user.toObject(); delete customer.password;
  return res.json({ token, refreshToken, customer });
}

// GET /api/customers/me
async function me(req, res) {
  const customer = buildCustomerProfile(req.user);
  return res.json({ customer });
}

// PUT /api/customers/me
async function updateMe(req, res) {
  const allowed = ['name', 'phone', 'email', 'address'];
  const update = {};
  for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
  if (update.phone) {
    const exists = await Customer.findOne({ _id: { $ne: req.user._id }, phone: update.phone });
    if (exists) throw ApiError.conflict('Phone already used');
  }
  if (update.email) {
    const exists = await Customer.findOne({ _id: { $ne: req.user._id }, email: update.email });
    if (exists) throw ApiError.conflict('Email already used');
  }
  await Customer.updateOne({ _id: req.user._id }, { $set: update });
  return res.json({ message: 'Updated', update });
}

// PUT /api/customers/change-password
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const ok = await bcrypt.compare(currentPassword, req.user.password);
  if (!ok) throw ApiError.badRequest('Current password incorrect');
  const hash = await bcrypt.hash(newPassword, 10);
  await Customer.updateOne({ _id: req.user._id }, { $set: { password: hash, lastLogoutAt: new Date() }, $inc: { tokenVersion: 1 } });
  return res.json({ message: 'Password changed' });
}

// PUT /api/customer/online
async function setOnline(req, res) {
  const { online, unavailableUntil } = req.body || {};
  if (online === undefined && unavailableUntil === undefined) throw ApiError.badRequest('online or unavailableUntil required');
  const update = {};
  if (online !== undefined) update.isOnline = !!online;
  if (unavailableUntil !== undefined) update.unavailableUntil = unavailableUntil ? new Date(unavailableUntil) : null;
  await Customer.updateOne({ _id: req.user._id }, { $set: update });
  return res.json(dataResponse({ online: update.isOnline ?? req.user.isOnline, unavailableUntil: (update.unavailableUntil ?? req.user.unavailableUntil) || null }));
}

// PUT /api/customer/availability
async function setAvailability(req, res) {
  const { slots } = req.body || {};
  if (!Array.isArray(slots)) throw ApiError.badRequest('slots must be array');
  const normalized = (slots || []).map((s) => ({
    dayOfWeek: Number(s.dayOfWeek),
    from: s.from,
    to: s.to,
  })).filter((s) => s.dayOfWeek >= 0 && s.dayOfWeek <= 6 && s.from && s.to);
  await Customer.updateOne({ _id: req.user._id }, { $set: { availabilitySlots: normalized } });
  return res.json(dataResponse({ availabilitySlots: normalized }));
}

// GET /api/customer/online
async function getOnlineStatus(req, res) {
  const doc = await Customer.findById(req.user._id).select('isOnline unavailableUntil availabilitySlots');
  return res.json(dataResponse({ online: !!doc?.isOnline, unavailableUntil: doc?.unavailableUntil || null, availabilitySlots: doc?.availabilitySlots || [] }));
}

// PUT /api/customer/location
async function setLocation(req, res) {
  const { lat, lng, address } = req.body || {};
  const location = { type: 'Point', coordinates: [lng, lat] };
  const update = { location, locationUpdatedAt: new Date() };
  if (address !== undefined) update.address = address;
  await Customer.updateOne({ _id: req.user._id }, { $set: update });
  return res.json(dataResponse({
    location: { lat, lng },
    address: address !== undefined ? address : (req.user.address || null),
  }));
}

// GET /api/customer/settings
async function getSettings(req, res) {
  const doc = await Customer.findById(req.user._id).select('settings notifications availabilitySlots isOnline unavailableUntil location address');
  const loc = (doc?.location?.coordinates || []).length === 2
    ? { lat: doc.location.coordinates[1], lng: doc.location.coordinates[0] }
    : null;
  const settings = {
    language: doc?.settings?.language || 'ar',
    theme: doc?.settings?.theme || 'light',
    notifications: {
      marketing: doc?.notifications?.marketing ?? true,
      requests: doc?.notifications?.requests ?? true,
      chat: doc?.notifications?.chat ?? true,
    },
    availabilitySlots: doc?.availabilitySlots || [],
    online: !!doc?.isOnline,
    unavailableUntil: doc?.unavailableUntil || null,
    location: loc,
    address: doc?.address || null,
  };
  return res.json(dataResponse({ settings }));
}

function createTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: /^(1|true|yes)$/i.test(process.env.SMTP_SECURE || ''),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

// POST /api/customer/verify
async function verify(req, res) {
  const { email, phone, code } = req.body;
  const user = await Customer.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ] });
  if (!user) throw ApiError.notFound('Account not found');
  const vc = await VerificationCode.findOne({ customerId: user._id, code, type: 'signup' });
  if (!vc) throw ApiError.badRequest('Invalid code');
  // check expiry and remove expired codes immediately
  if (vc.expiresAt && vc.expiresAt < new Date()) {
    await VerificationCode.deleteOne({ _id: vc._id });
    throw ApiError.badRequest('Code expired');
  }
  await Customer.updateOne({ _id: user._id }, { $set: { verified: true } });
  // delete the code after successful verification to prevent reuse
  await VerificationCode.deleteOne({ _id: vc._id });
  return res.json({ ok: true });
}

// POST /api/customer/forgot-password
async function forgotPassword(req, res) {
  const { email, phone, code, newPassword } = req.body;
  const user = await Customer.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ] });
  if (!user) throw ApiError.notFound('Account not found');
  if (!code && !newPassword) {
    const reset = (Math.floor(Math.random() * 900000) + 100000).toString();
  await VerificationCode.create({ customerId: user._id, code: reset, type: 'reset', createdAt: new Date(), expiresAt: new Date(Date.now() + 2*60*60*1000) });
    const htmlContent = passwordResetTemplate(reset, user.name);
    const tx = createTransport();
    if (tx && user.email) await tx.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: user.email, subject: 'Reset your Usta password', html: htmlContent });
    return res.json({ message: 'Reset code sent' });
  }
  if (!code || !newPassword) throw ApiError.badRequest('code and newPassword required');
  const vc = await VerificationCode.findOne({ customerId: user._id, code, type: 'reset' });
  if (!vc) throw ApiError.badRequest('Invalid code');
  if (vc.expiresAt && vc.expiresAt < new Date()) {
    await VerificationCode.deleteOne({ _id: vc._id });
    throw ApiError.badRequest('Code expired');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await Customer.updateOne({ _id: user._id }, { $set: { password: hash, lastLogoutAt: new Date() }, $inc: { tokenVersion: 1 } });
  // delete reset code after successful password change
  await VerificationCode.deleteOne({ _id: vc._id });
  return res.json({ message: 'Password updated' });
}

// Simple helpers
function addDays(d) { const t = new Date(); t.setDate(t.getDate() + d); return t; }

// Optional endpoints to match spec
async function logout(req, res) {
  await Customer.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 }, $set: { lastLogoutAt: new Date(), isOnline: false } });
  return res.json({ ok: true, message: 'Logged out' });
}
// POST /api/customer/refresh-token
async function refreshToken(req, res) {
  const bearer = getRefreshTokenFromRequest(req);
  if (!bearer) return res.status(401).json({ error: 'Unauthorized', message: 'Refresh token required' });
  try {
    const payload = jwt.verify(bearer, process.env.REFRESH_SECRET || process.env.JWT_SECRET || 'dev-secret');
    if (!payload?.sub || payload.kind !== 'customer' || payload.type !== 'refresh') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
    }
    const user = await Customer.findOne({ _id: payload.sub, deleted: { $ne: true } });
    if (!user) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
    const currentVersion = Number(user.tokenVersion || 0);
    const payloadVersion = Number(payload.tokenVersion || 0);
    if (payloadVersion !== currentVersion) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
    const issuedAt = payload.iat ? payload.iat * 1000 : 0;
    if (user.lastLogoutAt && issuedAt < user.lastLogoutAt.getTime()) return res.status(401).json({ error: 'Unauthorized', message: 'Invalid refresh token' });
    if (user.blocked) return res.status(403).json({ error: 'Forbidden', message: 'Your account is blocked by admin' });
    const updated = await Customer.findOneAndUpdate(
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
    console.error('customer refreshToken error', err);
    return res.status(500).json({ error: 'Server error', message: 'Failed to refresh token' });
  }
}
async function getProfile(req, res) { const customer = buildCustomerProfile(req.user); return res.json({ customer }); }
async function updateProfile(req, res) { return updateMe(req, res); }
async function uploadPhoto(req, res) {
  const photo = req.body?.photo;
  if (!photo) return res.status(400).json({ error: 'photo required' });
  const fs = require('fs'); const path = require('path');
  const m = photo.match(/^data:(.*?);base64,(.*)$/);
  const data = Buffer.from(m ? m[2] : photo, 'base64');
  const uploads = path.join(process.cwd(), 'uploads', 'avatars'); fs.mkdirSync(uploads, { recursive: true });
  const file = path.join(uploads, `${req.user._id}-${Date.now()}.jpg`); fs.writeFileSync(file, data);
  const rel = `/uploads/avatars/${path.basename(file)}`;
  await Customer.updateOne({ _id: req.user._id }, { $set: { photo: rel } });
  return res.json({ photo: rel });
}
async function deleteAccount(req, res) { await Customer.updateOne({ _id: req.user._id }, { $set: { deleted: true, deletedAt: new Date() } }); return res.json({ ok: true }); }

async function updateNotificationSettings(req, res) {
  const { marketing, requests, chat } = req.body; const set = {};
  if (marketing !== undefined) set['notifications.marketing'] = !!marketing;
  if (requests !== undefined) set['notifications.requests'] = !!requests;
  if (chat !== undefined) set['notifications.chat'] = !!chat;
  if (!Object.keys(set).length) return res.status(400).json({ error: 'No changes' });
  await Customer.updateOne({ _id: req.user._id }, { $set: set });
  return res.json({ ok: true });
}
async function setLanguage(req, res) { const lang = String((req.body.language || '')).toLowerCase(); if (!['ar','en'].includes(lang)) return res.status(400).json({ error:'Invalid language' }); await Customer.updateOne({ _id: req.user._id }, { $set: { 'settings.language': lang } }); return res.json({ ok: true }); }
async function setTheme(req, res) { const theme = String((req.body.theme || '')).toLowerCase(); if (!['dark','light'].includes(theme)) return res.status(400).json({ error:'Invalid theme' }); await Customer.updateOne({ _id: req.user._id }, { $set: { 'settings.theme': theme } }); return res.json({ ok: true }); }

module.exports = {
  signup,
  login,
  verify,
  forgotPassword,
  logout,
  me,
  getProfile,
  updateProfile,
  uploadPhoto,
  deleteAccount,
  updateMe,
  changePassword,
  updateNotificationSettings,
  setLanguage,
  setTheme,
  setOnline,
  setAvailability,
  getOnlineStatus,
  setLocation,
  getSettings,
  refreshToken,
};
