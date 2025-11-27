const Coupon = require('../models/coupon.model');
const CouponUse = require('../models/couponUse.model');
const Referral = require('../models/referral.model');
const Request = require('../models/request.model');
const { ApiError } = require('../errors/apiError');
const { dataResponse } = require('../utils/responder');

function normalizeCoupon(c) {
  if (!c) return null;
  return {
    code: c.code,
    discountType: c.discountType || c.type || 'percent',
    value: typeof c.value === 'number' ? c.value : c.discount,
    minOrder: c.minOrder || 0,
    expiresAt: c.expiresAt,
    active: c.active,
  };
}

async function coupons(req, res) {
  const rows = await Coupon.find({ active: true });
  return res.json(dataResponse(rows.map(normalizeCoupon)));
}

async function applyCoupon(req, res) {
  const code = String((req.body.code || '')).trim().toUpperCase();
  const amount = req.body.amount !== undefined ? Number(req.body.amount) : undefined;
  if (!code) throw ApiError.badRequest('code required');
  if (amount !== undefined && (Number.isNaN(amount) || amount <= 0)) throw ApiError.badRequest('amount must be > 0');
  const c = await Coupon.findOne({ code, active: true });
  if (!c) throw ApiError.notFound('Invalid coupon');
  if (c.expiresAt && c.expiresAt < new Date()) throw ApiError.badRequest('Coupon expired');
  if (amount !== undefined && amount < (c.minOrder || 0)) throw ApiError.badRequest('Order amount below minimum');
  const used = await CouponUse.findOne({ couponId: c._id, customerId: req.user._id });
  if (used) throw ApiError.conflict('Coupon already used by this customer');

  // Calculate discount if amount provided
  let discountAmount = null;
  let finalAmount = null;
  if (amount !== undefined) {
    if ((c.discountType || c.type) === 'fixed') {
      discountAmount = Math.min(c.value || c.discount || 0, amount);
    } else {
      const pct = c.value || c.discount || 0;
      discountAmount = +(amount * (pct / 100)).toFixed(2);
    }
    finalAmount = +(amount - discountAmount).toFixed(2);
  }

  await CouponUse.create({ couponId: c._id, customerId: req.user._id, code });
  return res.json(
    dataResponse({
      applied: true,
      coupon: normalizeCoupon(c),
      discountAmount,
      finalAmount,
    }),
  );
}

async function referral(req, res) {
  const code = String((req.body.code || '')).trim();
  if (!code) throw ApiError.badRequest('code required');
  await Referral.create({ customerId: req.user._id, code });
  return res.json(dataResponse({ ok: true }));
}

async function rewards(req, res) {
  const completed = await Request.countDocuments({ customerId: req.user._id, status: 'completed' });
  const points = completed * 10;
  return res.json(dataResponse({ points }));
}

async function recommendations(req, res) { return res.json(dataResponse({ recommended: [] })); }
async function liveMap(req, res) { return res.json(dataResponse({ message: 'Live map not implemented yet' })); }
async function aiFeedback(req, res) { return res.json(dataResponse({ message: 'AI feedback not implemented yet' })); }

module.exports = { coupons, applyCoupon, referral, rewards, recommendations, liveMap, aiFeedback };
