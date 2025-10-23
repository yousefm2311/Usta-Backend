const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Customer = require('../models/customer.model');
const VerificationCode = require('../models/verificationCode.model');
const { ApiError } = require('../errors/apiError');

function signToken(userId) {
  const secret = process.env.JWT_SECRET || 'dev-secret';
  return jwt.sign({ sub: String(userId) }, secret, { expiresIn: process.env.ACCESS_TTL_SEC ? Number(process.env.ACCESS_TTL_SEC) : 60 * 60 });
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
    await VerificationCode.create({ customerId: doc._id, code, type: 'signup', createdAt: new Date(), expiresAt: new Date(Date.now() + 2*24*60*60*1000) });
    const tx = createTransport();
    if (tx) await tx.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: email, subject: 'Verify your Usta account', html: `<p>Your verification code is <b>${code}</b></p>` });
  }
  const customer = doc.toObject(); delete customer.password;
  return res.status(201).json({ message: 'Signup successful. Please verify your email.', customer });
}

// POST /api/customers/login
async function login(req, res) {
  const { phone, email, password } = req.body;
  const user = await Customer.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ], deleted: { $ne: true } });
  if (!user) throw ApiError.unauthorized('Invalid credentials');
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) throw ApiError.unauthorized('Invalid credentials');
  if (!user.verified) {
    if (user.email) {
      const code = (Math.floor(Math.random() * 900000) + 100000).toString();
      await VerificationCode.create({ customerId: user._id, code, type: 'signup', createdAt: new Date(), expiresAt: new Date(Date.now() + 2*24*60*60*1000) });
      const tx = createTransport();
      if (tx) await tx.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: user.email, subject: 'Verify your Usta account', html: `<p>Your verification code is <b>${code}</b></p>` });
    }
    throw ApiError.forbidden('Account not verified. Verification code sent to your email.');
  }
  const token = signToken(user._id);
  const customer = user.toObject(); delete customer.password;
  return res.json({ token, customer });
}

// GET /api/customers/me
async function me(req, res) {
  const customer = req.user.toObject(); delete customer.password;
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
  await Customer.updateOne({ _id: req.user._id }, { $set: { password: hash } });
  return res.json({ message: 'Password changed' });
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
  await Customer.updateOne({ _id: user._id }, { $set: { verified: true } });
  return res.json({ ok: true });
}

// POST /api/customer/forgot-password
async function forgotPassword(req, res) {
  const { email, phone, code, newPassword } = req.body;
  const user = await Customer.findOne({ $or: [ ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []) ] });
  if (!user) throw ApiError.notFound('Account not found');
  if (!code && !newPassword) {
    const reset = (Math.floor(Math.random() * 900000) + 100000).toString();
    await VerificationCode.create({ customerId: user._id, code: reset, type: 'reset', createdAt: new Date(), expiresAt: new Date(Date.now() + 24*60*60*1000) });
    const tx = createTransport();
    if (tx && user.email) await tx.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: user.email, subject: 'Reset your Usta password', html: `<p>Your reset code is <b>${reset}</b></p>` });
    return res.json({ message: 'Reset code sent' });
  }
  if (!code || !newPassword) throw ApiError.badRequest('code and newPassword required');
  const vc = await VerificationCode.findOne({ customerId: user._id, code, type: 'reset' });
  if (!vc) throw ApiError.badRequest('Invalid code');
  const hash = await bcrypt.hash(newPassword, 10);
  await Customer.updateOne({ _id: user._id }, { $set: { password: hash } });
  return res.json({ message: 'Password updated' });
}

module.exports = { signup, login, verify, forgotPassword, me, updateMe, changePassword };
