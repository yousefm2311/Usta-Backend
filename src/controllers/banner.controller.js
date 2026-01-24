const Banner = require('../models/banner.model');
const { ApiError } = require('../errors/apiError');
const { assertObjectId } = require('../utils/shared/objectId');
const { getPagination } = require('../utils/shared/pagination');
const { cacheGet, cacheSet, cacheDelByPattern } = require('../services/shared/redis.service');

const ACTIVE_CACHE_PREFIX = 'banners:active';
const ACTIVE_CACHE_TTL_SECONDS = 30;

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v || '').trim())
    .filter((v) => v.length > 0);
}

function buildPayload(body) {
  const payload = {};

  if (hasOwn(body, 'title')) payload.title = String(body.title || '').trim();
  if (hasOwn(body, 'subtitle')) payload.subtitle = String(body.subtitle || '').trim();
  if (hasOwn(body, 'image')) payload.image = String(body.image || '').trim();
  if (hasOwn(body, 'gradientColors')) payload.gradientColors = normalizeArray(body.gradientColors);
  if (hasOwn(body, 'actionType')) payload.actionType = String(body.actionType || '').trim();
  if (hasOwn(body, 'actionValue')) payload.actionValue = String(body.actionValue || '').trim();
  if (hasOwn(body, 'isActive')) payload.isActive = !!body.isActive;
  if (hasOwn(body, 'priority')) payload.priority = Number.parseInt(body.priority, 10) || 0;

  if (hasOwn(body, 'startAt')) {
    payload.startAt = body.startAt ? new Date(body.startAt) : null;
  }
  if (hasOwn(body, 'endAt')) {
    payload.endAt = body.endAt ? new Date(body.endAt) : null;
  }

  if (hasOwn(body, 'targetCities')) payload.targetCities = normalizeArray(body.targetCities);
  if (hasOwn(body, 'targetCategories')) payload.targetCategories = normalizeArray(body.targetCategories);
  if (hasOwn(body, 'targetUserType')) payload.targetUserType = String(body.targetUserType || '').trim();

  return payload;
}

function ensureValidDateRange(startAt, endAt) {
  if (startAt && endAt && endAt < startAt) {
    throw ApiError.badRequest('endAt must be after startAt');
  }
}

function enforceActionRules(payload, current) {
  const nextType = payload.actionType ?? current?.actionType ?? 'none';
  const nextValue = payload.actionValue ?? current?.actionValue;

  if (nextType !== 'none' && !nextValue) {
    throw ApiError.badRequest('actionValue required for actionType');
  }

  if (nextType === 'none') {
    payload.actionValue = null;
  }
}

function buildActiveCacheKey({ city, category, userType }) {
  return [
    ACTIVE_CACHE_PREFIX,
    (userType || 'all').toLowerCase(),
    (city || 'all').toLowerCase(),
    (category || 'all').toLowerCase(),
  ].join(':');
}

async function invalidateActiveCache() {
  await cacheDelByPattern(`${ACTIVE_CACHE_PREFIX}:*`);
}

async function createBanner(req, res, next) {
  try {
    const payload = buildPayload(req.body);
    if (!payload.title) throw ApiError.badRequest('title is required');

    enforceActionRules(payload);
    ensureValidDateRange(payload.startAt, payload.endAt);

    const doc = await Banner.create(payload);
    await invalidateActiveCache();

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    return next(err);
  }
}

async function updateBanner(req, res, next) {
  try {
    const { id } = req.params;
    assertObjectId(id, 'bannerId');

    const existing = await Banner.findById(id);
    if (!existing) throw ApiError.notFound('Banner not found');

    const payload = buildPayload(req.body);
    if (!Object.keys(payload).length) throw ApiError.badRequest('No fields to update');

    enforceActionRules(payload, existing);

    const nextStart = payload.startAt !== undefined ? payload.startAt : existing.startAt;
    const nextEnd = payload.endAt !== undefined ? payload.endAt : existing.endAt;
    ensureValidDateRange(nextStart, nextEnd);

    const updated = await Banner.findByIdAndUpdate(id, { $set: payload }, { new: true });
    await invalidateActiveCache();

    return res.json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
}

async function deleteBanner(req, res, next) {
  try {
    const { id } = req.params;
    assertObjectId(id, 'bannerId');

    const removed = await Banner.findByIdAndDelete(id);
    if (!removed) throw ApiError.notFound('Banner not found');

    await invalidateActiveCache();
    return res.json({ success: true, data: { id } });
  } catch (err) {
    return next(err);
  }
}

async function listBanners(req, res, next) {
  try {
    const { page, perPage, skip } = getPagination(req);
    const filters = {};

    if (hasOwn(req.query, 'isActive')) {
      const raw = String(req.query.isActive).toLowerCase();
      filters.isActive = raw === 'true' || raw === '1';
    }

    const [rows, total] = await Promise.all([
      Banner.find(filters)
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(perPage)
        .lean(),
      Banner.countDocuments(filters),
    ]);

    return res.json({
      success: true,
      data: rows,
      pagination: { total, page, perPage },
    });
  } catch (err) {
    return next(err);
  }
}

async function getActiveBanners(req, res, next) {
  try {
    const now = new Date();
    const city = (req.query.city || '').toString().trim();
    const category = (req.query.category || '').toString().trim();
    const userType = ((req.query.userType || '').toString().trim() || 'all');

    const cacheKey = buildActiveCacheKey({ city, category, userType });
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return res.json({ success: true, data: JSON.parse(cached) });
    }

    const filter = {
      isActive: true,
      $and: [
        { $or: [{ startAt: null }, { startAt: { $exists: false } }, { startAt: { $lte: now } }] },
        { $or: [{ endAt: null }, { endAt: { $exists: false } }, { endAt: { $gte: now } }] },
      ],
    };

    filter.targetUserType = { $in: ['all', userType] };

    if (city) {
      filter.$and.push({
        $or: [
          { targetCities: { $exists: false } },
          { targetCities: null },
          { targetCities: { $size: 0 } },
          { targetCities: city },
        ],
      });
    }

    if (category) {
      filter.$and.push({
        $or: [
          { targetCategories: { $exists: false } },
          { targetCategories: null },
          { targetCategories: { $size: 0 } },
          { targetCategories: category },
        ],
      });
    }

    const rows = await Banner.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    await cacheSet(cacheKey, JSON.stringify(rows), ACTIVE_CACHE_TTL_SECONDS);
    return res.json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createBanner,
  updateBanner,
  deleteBanner,
  listBanners,
  getActiveBanners,
};
