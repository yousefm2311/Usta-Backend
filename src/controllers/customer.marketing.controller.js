const Coupon = require('../models/coupon.model');
const CouponUse = require('../models/couponUse.model');
const Referral = require('../models/referral.model');
const Request = require('../models/request.model');
const Favorite = require('../models/favorite.model');
const Artisan = require('../models/artisan.model');
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

// Live map: return nearby artisans with minimal info + distance
async function liveMap(req, res) {
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : (req.user.location?.coordinates?.[1]);
  const lng = req.query.lng !== undefined ? Number(req.query.lng) : (req.user.location?.coordinates?.[0]);
  if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
    return res.status(400).json({ error: 'Invalid location', message: 'lat/lng are required for live map' });
  }
  const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : 20; // default 20km
  const maxDistance = radiusKm * 1000;

  const rows = await Artisan.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        maxDistance,
        spherical: true,
        key: 'location',
        query: { location: { $exists: true }, suspended: { $ne: true }, deleted: { $ne: true } },
      },
    },
    {
      $project: {
        name: 1,
        profession: 1,
        avatar: '$photo',
        status: 1,
        isOnline: 1,
        location: 1,
        distanceMeters: 1,
      },
    },
    { $sort: { distanceMeters: 1 } },
    { $limit: 100 },
  ]);

  const artisans = rows.map((a) => ({
    _id: a._id,
    name: a.name,
    profession: a.profession,
    status: a.status,
    isOnline: !!a.isOnline,
    avatar: a.avatar || a.photo || null,
    distanceMeters: a.distanceMeters,
    location: (a.location?.coordinates || []).length === 2
      ? { lat: a.location.coordinates[1], lng: a.location.coordinates[0] }
      : null,
  }));

  return res.json(dataResponse({ center: { lat, lng }, radiusKm, artisans }));
}

// Simple AI-like feedback: summarize usage stats for the customer
async function aiFeedback(req, res) {
  const [completed, active, favorites] = await Promise.all([
    Request.countDocuments({ customerId: req.user._id, status: 'completed' }),
    Request.countDocuments({ customerId: req.user._id, status: { $nin: ['completed', 'cancelled', 'rejected', 'expired'] } }),
    Favorite.countDocuments({ customerId: req.user._id }),
  ]);
  const message = `أهلاً ${req.user.name || ''}! أنجزت ${completed} طلب${completed === 1 ? '' : 'ات'} حتى الآن. لديك ${active} طلب نشط و${favorites} حرفي في المفضلة.`;
  return res.json(dataResponse({
    message,
    stats: { completed, active, favorites },
  }));
}

module.exports = { coupons, applyCoupon, referral, rewards, recommendations, liveMap, aiFeedback };
