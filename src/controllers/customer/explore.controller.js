const { ApiError } = require('../../errors/apiError');
const { dataResponse } = require('../../utils/shared/responder');
const { getPagination } = require('../../utils/shared/pagination');
const Artisan = require('../../models/artisan.model');
const Review = require('../../models/review.model');
const View = require('../../models/view.model');
const Category = require('../../models/category.model');

const MAX_QUERY_LENGTH = 64;
const MAX_GEO_RADIUS_M = Number(process.env.MAX_GEO_RADIUS_M) || 100000;

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeQuery(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > MAX_QUERY_LENGTH ? text.slice(0, MAX_QUERY_LENGTH) : text;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildRegex(value) {
  const text = normalizeQuery(value);
  if (!text) return null;
  return { $regex: escapeRegExp(text), $options: 'i' };
}

function buildArtisanFilter(req) {
  const filter = { deleted: { $ne: true }, suspended: { $ne: true }, verified: true };
  const profession = buildRegex(req.query?.profession);
  if (profession) filter.profession = profession;
  const service = buildRegex(req.query?.service);
  if (service) filter['services.name'] = service;
  if (String(req.query?.status).toLowerCase() === 'available') filter.status = 'available';
  if (String(req.query?.online).toLowerCase() === 'true') filter.isOnline = true;
  return filter;
}

async function getCategories(req, res) {
  const rows = await Category.find({}).sort({ name: 1 }).lean();
  return res.json(dataResponse({ categories: rows }));
}

async function searchArtisans(req, res) {
  const q = normalizeQuery(req.query.query);
  const baseFilter = buildArtisanFilter(req);
  const search = q
    ? {
      $or: [
        { name: { $regex: escapeRegExp(q), $options: 'i' } },
        { profession: { $regex: escapeRegExp(q), $options: 'i' } },
        { address: { $regex: escapeRegExp(q), $options: 'i' } },
      ],
    }
    : null;
  const filter = search ? { ...baseFilter, ...search } : baseFilter;
  const { page, perPage, skip } = getPagination(req, { defaultPerPage: 50, maxPerPage: 100 });
  const [rows, total] = await Promise.all([
    Artisan.find(filter).select('-password').skip(skip).limit(perPage).lean(),
    Artisan.countDocuments(filter),
  ]);
  return res.json(dataResponse({ artisans: rows }, { total, page, perPage, query: q || null }));
}

async function getArtisanDetails(req, res) {
  const { id } = req.params;
  const artisan = await Artisan.findOne({ _id: id, deleted: { $ne: true }, suspended: { $ne: true }, verified: true })
    .select('-password')
    .lean();
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
  const lat = toNumber(req.query.lat);
  const lng = toNumber(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw ApiError.badRequest('lat and lng are required');
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw ApiError.badRequest('Invalid lat or lng');
  const rawRadius = parseInt(req.query.radius, 10);
  const radius = Math.max(
    100,
    Math.min(Number.isNaN(rawRadius) ? 60000 : rawRadius, MAX_GEO_RADIUS_M),
  );
  const { page, perPage, skip } = getPagination(req, { defaultPerPage: 50, maxPerPage: 100 });
  const filter = buildArtisanFilter(req);
  const rows = await Artisan.find({
    ...filter,
    location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: radius } },
  })
    .select('-password')
    .skip(skip)
    .limit(perPage)
    .lean();
  return res.json(dataResponse({ artisans: rows }, { page, perPage, radius, center: { lat, lng } }));
}

async function artisansInArea(req, res) {
  const swLat = toNumber(req.query.swLat);
  const swLng = toNumber(req.query.swLng);
  const neLat = toNumber(req.query.neLat);
  const neLng = toNumber(req.query.neLng);
  if ([swLat, swLng, neLat, neLng].some((v) => !Number.isFinite(v))) {
    throw ApiError.badRequest('swLat, swLng, neLat, neLng are required');
  }
  if ([swLat, neLat].some((v) => v < -90 || v > 90) || [swLng, neLng].some((v) => v < -180 || v > 180)) {
    throw ApiError.badRequest('Invalid lat or lng');
  }
  if (swLat > neLat || swLng > neLng) throw ApiError.badRequest('Invalid bounding box');
  const { page, perPage, skip } = getPagination(req, { defaultPerPage: 100, maxPerPage: 200 });
  const filter = buildArtisanFilter(req);
  const rows = await Artisan.find({
    ...filter,
    location: { $geoWithin: { $box: [[swLng, swLat], [neLng, neLat]] } },
  })
    .select('-password')
    .skip(skip)
    .limit(perPage)
    .lean();
  return res.json(dataResponse({ artisans: rows }, { page, perPage, bounds: { swLat, swLng, neLat, neLng } }));
}

async function topRatedArtisans(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 50);
  const minReviews = Math.max(parseInt(req.query.minReviews || '0', 10), 0);
  const pipeline = [
    { $group: { _id: '$artisanId', avgRating: { $avg: '$rating' }, count: { $sum: 1 } } },
  ];
  if (minReviews > 0) {
    pipeline.push({ $match: { count: { $gte: minReviews } } });
  }
  pipeline.push(
    { $sort: { avgRating: -1, count: -1 } },
    { $limit: limit },
  );
  const agg = await Review.aggregate(pipeline);
  const ids = agg.map((a) => a._id);
  const map = new Map(agg.map((a) => [String(a._id), a]));
  const baseFilter = buildArtisanFilter(req);
  const rows = await Artisan.find({ ...baseFilter, _id: { $in: ids } }).select('-password').lean();
  const byId = new Map(rows.map((r) => [String(r._id), r]));
  const enriched = ids
    .map((id) => {
      const row = byId.get(String(id));
      if (!row) return null;
      return { ...row, rating: map.get(String(id)) };
    })
    .filter(Boolean);
  return res.json(dataResponse({ artisans: enriched }, { limit, minReviews }));
}

module.exports = { getCategories, searchArtisans, getArtisanDetails, nearbyArtisans, artisansInArea, topRatedArtisans };


