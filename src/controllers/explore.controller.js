const { ApiError } = require('../errors/apiError');
const Artisan = require('../models/artisan.model');
const Review = require('../models/review.model');
const View = require('../models/view.model');

function sanitizeArtisan(a) {
  if (!a) return null;
  const o = a.toObject ? a.toObject() : a;
  delete o.password;
  return o;
}

async function getCategories(req, res) {
  // Simple static fallback; can be moved to a collection later
  return res.json({ categories: ['Plumbing', 'Electricity', 'Carpentry', 'Painting', 'AC', 'Moving'] });
}

async function searchArtisans(req, res) {
  const q = (req.query.query || '').trim();
  const filter = q
    ? { $or: [ { name: { $regex: q, $options: 'i' } }, { profession: { $regex: q, $options: 'i' } }, { address: { $regex: q, $options: 'i' } } ], deleted: { $ne: true } }
    : { deleted: { $ne: true } };
  const rows = await Artisan.find(filter).select('-password').limit(50);
  return res.json({ artisans: rows });
}

async function getArtisanDetails(req, res) {
  const { id } = req.params;
  const artisan = await Artisan.findOne({ _id: id, deleted: { $ne: true } }).select('-password');
  if (!artisan) throw ApiError.notFound('Not found');
  const [ratingAgg] = await Review.aggregate([
    { $match: { artisanId: artisan._id } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  // Record view if customer auth present
  try {
    if (req.userRole === 'customer' && req.user?._id) {
      await View.create({ customerId: req.user._id, artisanId: artisan._id });
    }
  } catch (_) {}
  return res.json({ artisan, rating: { average: Number((ratingAgg?.avg || 0).toFixed(2)), count: ratingAgg?.count || 0 } });
}

async function nearbyArtisans(req, res) {
  const lat = parseFloat(req.query.lat); const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) throw ApiError.badRequest('Invalid coordinates');
  const rows = await Artisan.find({ location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: 10000 } }, deleted: { $ne: true } }).select('-password').limit(50);
  return res.json({ artisans: rows });
}

async function topRatedArtisans(req, res) {
  const agg = await Review.aggregate([
    { $group: { _id: '$artisanId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
    { $sort: { avgRating: -1, count: -1 } },
    { $limit: 20 },
  ]);
  const ids = agg.map((a) => a._id);
  const map = new Map(agg.map((a) => [String(a._id), a]));
  const rows = await Artisan.find({ _id: { $in: ids } }).select('-password');
  const enriched = rows.map((r) => ({ ...sanitizeArtisan(r), rating: map.get(String(r._id)) }));
  return res.json({ artisans: enriched });
}

module.exports = { getCategories, searchArtisans, getArtisanDetails, nearbyArtisans, topRatedArtisans };

