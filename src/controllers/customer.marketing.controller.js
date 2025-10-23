const Coupon = require('../models/coupon.model');
const CouponUse = require('../models/couponUse.model');
const Referral = require('../models/referral.model');
const Request = require('../models/request.model');

async function coupons(req, res) {
  const rows = await Coupon.find({ active: true }).select('code discount type expiresAt');
  return res.json({ coupons: rows });
}

async function applyCoupon(req, res) {
  const code = String((req.body.code || '')).trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  const c = await Coupon.findOne({ code, active: true });
  if (!c) return res.status(404).json({ error: 'Invalid coupon' });
  await CouponUse.create({ couponId: c._id, customerId: req.user._id, code });
  return res.json({ applied: true, coupon: { code: c.code, discount: c.discount, type: c.type } });
}

async function referral(req, res) {
  const code = String((req.body.code || '')).trim();
  if (!code) return res.status(400).json({ error: 'code required' });
  await Referral.create({ customerId: req.user._id, code });
  return res.json({ ok: true });
}

async function rewards(req, res) {
  const completed = await Request.countDocuments({ customerId: req.user._id, status: 'completed' });
  const points = completed * 10;
  return res.json({ points });
}

async function recommendations(req, res) { return res.json({ recommended: [] }); }
async function liveMap(req, res) { return res.json({ message: 'Live map not implemented yet' }); }
async function aiFeedback(req, res) { return res.json({ message: 'AI feedback not implemented yet' }); }

module.exports = { coupons, applyCoupon, referral, rewards, recommendations, liveMap, aiFeedback };

