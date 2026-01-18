const { ApiError } = require('../../errors/apiError');
const { dataResponse } = require('../../utils/shared/responder');
const Artisan = require('../../models/artisan.model');
const Review = require('../../models/review.model');
const View = require('../../models/view.model');
const Category = require('../../models/category.model');

function buildArtisanFilter(req) {
  const filter = { deleted: { $ne: true }, suspended: { $ne: true }, verified: true };
  if (req.query?.profession) filter.profession = { $regex: req.query.profession, $options: 'i' };
  if (req.query?.service) filter['services.name'] = { $regex: req.query.service, $options: 'i' };
  if (String(req.query?.status).toLowerCase() === 'available') filter.status = 'available';
  if (String(req.query?.online).toLowerCase() === 'true') filter.isOnline = true;
  return filter;
}

function sanitizeArtisan(a) {
  if (!a) return null;
  const o = a.toObject ? a.toObject() : a;
  delete o.password;
  return o;
}

async function getCategories(req, res) {
  const rows = await Category.find({}).sort({ name: 1 }).lean();
  return res.json(dataResponse({ categories: rows }));
}

async function searchArtisans(req, res) {
  const q = (req.query.query || '').trim();
  const filter = q
    ? { $or: [ { name: { $regex: q, $options: 'i' } }, { profession: { $regex: q, $options: 'i' } }, { address: { $regex: q, $options: 'i' } } ], deleted: { $ne: true } }
    : { deleted: { $ne: true } };
  const rows = await Artisan.find(filter).select('-password').limit(50);
  return res.json(dataResponse({ artisans: rows }));
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
  return res.json(dataResponse({ artisan, rating: { average: Number((ratingAgg?.avg || 0).toFixed(2)), count: ratingAgg?.count || 0 } }));
}

async function nearbyArtisans(req, res) {
  const lat = parseFloat(req.query.lat); const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) throw ApiError.badRequest('lat and lng are required');
  const radius = Math.min(Math.max(parseInt(req.query.radius || '10000', 10), 100), 50000); // clamp between 100m and 50km
  const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 100);
  const filter = buildArtisanFilter(req);
  const rows = await Artisan.find({
    ...filter,
    location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: radius } },
  })
    .select('-password')
    .limit(limit);
  return res.json(dataResponse({ artisans: rows }));
}

async function artisansInArea(req, res) {
  const swLat = parseFloat(req.query.swLat); const swLng = parseFloat(req.query.swLng);
  const neLat = parseFloat(req.query.neLat); const neLng = parseFloat(req.query.neLng);
  if ([swLat, swLng, neLat, neLng].some(Number.isNaN)) throw ApiError.badRequest('swLat, swLng, neLat, neLng are required');
  if (swLat > neLat || swLng > neLng) throw ApiError.badRequest('Invalid bounding box');
  const limit = Math.min(Math.max(parseInt(req.query.limit || '100', 10), 1), 200);
  const filter = buildArtisanFilter(req);
  const rows = await Artisan.find({
    ...filter,
    location: { $geoWithin: { $box: [[swLng, swLat], [neLng, neLat]] } },
  })
    .select('-password')
    .limit(limit);
  return res.json(dataResponse({ artisans: rows }));
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
  return res.json(dataResponse({ artisans: enriched }));
}

module.exports = { getCategories, searchArtisans, getArtisanDetails, nearbyArtisans, artisansInArea, topRatedArtisans };


