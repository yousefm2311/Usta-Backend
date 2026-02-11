const mongoose = require('mongoose');
const { ApiError } = require('../../errors/apiError');
const Request = require('../../models/request.model');
const RequestTimeline = require('../../models/requestTimeline.model');
const Transaction = require('../../models/transaction.model');
const { dataResponse, paginatedResponse } = require('../../utils/shared/responder');
const { saveBase64Image } = require('../../utils/shared/images');
const { notifyUser } = require('../../utils/shared/notify');
const { getPagination } = require('../../utils/shared/pagination');
const Category = require('../../models/category.model');
const {
  emitRequestEvent,
  emitRequestToMatchingArtisans,
  cancelByCustomer,
  confirmCompletion,
} = require('../../services/requests/request.service');

const REQUEST_IMAGE_MAX_DIM = 1280;
const REQUEST_IMAGE_QUALITY = 72;
const REQUEST_IMAGE_MAX_BYTES = Number(process.env.REQUEST_IMAGE_MAX_BYTES) || 6 * 1024 * 1024;
const REQUEST_IMAGE_MAX_COUNT = Number(process.env.REQUEST_IMAGE_MAX_COUNT) || 8;
const REQUEST_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveCategory(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (mongoose.isValidObjectId(raw)) {
    const byId = await Category.findById(raw).lean();
    if (byId) return byId;
  }
  const byName = await Category.findOne({ name: new RegExp(`^${escapeRegExp(raw)}$`, 'i') }).lean();
  return byName;
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function hasPaginationParams(req) {
  return req.query?.page !== undefined || req.query?.perPage !== undefined || req.query?.limit !== undefined;
}

function buildImageName(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function saveRequestImage(base64, name) {
  return saveBase64Image({
    base64,
    dir: 'requests',
    name,
    maxDim: REQUEST_IMAGE_MAX_DIM,
    quality: REQUEST_IMAGE_QUALITY,
    maxBytes: REQUEST_IMAGE_MAX_BYTES,
    allowedMimes: REQUEST_IMAGE_MIMES,
  });
}

// POST /api/customer/requests
async function createRequest(req, res) {
  const { serviceType, serviceId, artisanId, description, lat, lng, address, images } = req.body || {};
  if (!serviceType && !serviceId && !artisanId) throw ApiError.badRequest('serviceType or serviceId or artisanId required');
  let normalizedServiceType = null;
  if (serviceId && !serviceType) {
    const category = await resolveCategory(serviceId);
    if (!category) throw ApiError.badRequest('Invalid serviceId');
    normalizedServiceType = category.name;
  }
  if (serviceType) {
    const category = await resolveCategory(serviceType);
    if (!category) throw ApiError.badRequest('Invalid serviceType');
    normalizedServiceType = category.name;
  }

  const latNum = toNumber(lat);
  const lngNum = toNumber(lng);
  const hasLat = Number.isFinite(latNum);
  const hasLng = Number.isFinite(lngNum);
  if (hasLat !== hasLng) throw ApiError.badRequest('lat and lng are required together');
  if (hasLat && (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180)) {
    throw ApiError.badRequest('Invalid lat or lng');
  }

  const imageInputs = Array.isArray(images) ? images.filter(Boolean) : [];
  if (imageInputs.length > REQUEST_IMAGE_MAX_COUNT) {
    throw ApiError.badRequest(`Maximum ${REQUEST_IMAGE_MAX_COUNT} images`);
  }

  const doc = {
    customerId: req.user._id,
    artisanId: artisanId || null,
    serviceType: normalizedServiceType || null,
    description: typeof description === 'string' ? description.trim() : '',
    images: [],
    status: artisanId ? 'assigned' : 'new',
    address: typeof address === 'string' && address.trim() ? address.trim() : undefined,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
  if (hasLat && hasLng) doc.location = { type: 'Point', coordinates: [lngNum, latNum] };
  for (const img of imageInputs) {
    doc.images.push(await saveRequestImage(img, buildImageName('request')));
  }
  const saved = await Request.create(doc);
  if (saved.artisanId) {
    await notifyUser({
      artisanId: saved.artisanId,
      type: 'request',
      title: 'New request assigned',
      body: `You have a new request${saved.serviceType ? ` for ${saved.serviceType}` : ''}.`,
      data: { requestId: String(saved._id), type: 'new_request' },
    });
  }
  await RequestTimeline.create({ requestId: saved._id, status: saved.status, actorId: req.user._id });
  emitRequestEvent('request:new', saved);
  if (!saved.artisanId) {
    await emitRequestToMatchingArtisans('request:new', saved);
  }
  return res.status(201).json({ request: saved, ...dataResponse({ request: saved }) });
}

// POST /api/customer/requests/:id/images
async function addImages(req, res) {
  const { id } = req.params;
  const body = req.body || {};
  const reqDoc = await Request.findOne({ _id: id, customerId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  const inputs = Array.isArray(body.images) ? body.images.filter(Boolean) : [];
  if (!inputs.length) throw ApiError.badRequest('images required');
  const currentCount = reqDoc.images?.length || 0;
  if (currentCount + inputs.length > REQUEST_IMAGE_MAX_COUNT) {
    throw ApiError.badRequest(`Maximum ${REQUEST_IMAGE_MAX_COUNT} images`);
  }
  const newPaths = [];
  for (const img of inputs) {
    newPaths.push(await saveRequestImage(img, buildImageName(id)));
  }
  await Request.updateOne({ _id: reqDoc._id }, { $push: { images: { $each: newPaths } } });
  return res.json({ images: newPaths, ...dataResponse({ images: newPaths }) });
}

async function getActive(req, res) {
  const query = { customerId: req.user._id, status: { $nin: ['completed', 'cancelled', 'rejected', 'expired'] } };
  if (!hasPaginationParams(req)) {
    const rows = await Request.find(query).sort({ createdAt: -1 });
    return res.json({ requests: rows, ...dataResponse({ requests: rows }) });
  }
  const { page, perPage, skip } = getPagination(req, { defaultPerPage: 50, maxPerPage: 200 });
  const [rows, total] = await Promise.all([
    Request.find(query).sort({ createdAt: -1 }).skip(skip).limit(perPage),
    Request.countDocuments(query),
  ]);
  const payload = paginatedResponse(rows, total, page, perPage);
  return res.json({ requests: rows, ...payload });
}

async function getHistory(req, res) {
  const query = { customerId: req.user._id, status: { $in: ['completed', 'cancelled', 'rejected', 'expired'] } };
  if (!hasPaginationParams(req)) {
    const rows = await Request.find(query).sort({ createdAt: -1 });
    return res.json({ requests: rows, ...dataResponse({ requests: rows }) });
  }
  const { page, perPage, skip } = getPagination(req, { defaultPerPage: 50, maxPerPage: 200 });
  const [rows, total] = await Promise.all([
    Request.find(query).sort({ createdAt: -1 }).skip(skip).limit(perPage),
    Request.countDocuments(query),
  ]);
  const payload = paginatedResponse(rows, total, page, perPage);
  return res.json({ requests: rows, ...payload });
}

async function getRequestDetail(req, res) {
  const row = await Request.findOne({ _id: req.params.id, customerId: req.user._id })
    .populate('artisanId', 'name email phone profession services pricing location')
    .populate('customerId', 'name email phone');
  if (!row) throw ApiError.notFound('Request not found');
  const payload = { ...row.toObject(), customer: row.customerId, artisan: row.artisanId };
  if (payload.artisan && payload.artisan.location?.coordinates?.length === 2) {
    payload.artisan.location = { lat: payload.artisan.location.coordinates[1], lng: payload.artisan.location.coordinates[0] };
  }
  return res.json({ request: payload, ...dataResponse({ request: payload }) });
}

async function getRequestTimeline(req, res) {
  const reqDoc = await Request.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  const steps = await RequestTimeline.find({ requestId: reqDoc._id }).sort({ createdAt: 1 });
  return res.json({ data: steps });
}

async function cancelRequest(req, res) {
  const { id } = req.params;
  const { reason } = req.body || {};
  const updated = await cancelByCustomer(id, req.user._id, reason);
  return res.json({ ok: true, request: updated, ...dataResponse({ request: updated, ok: true }) });
}

// POST /api/customer/requests/:id/confirm-completion
async function confirmRequestCompletion(req, res) {
  const { id } = req.params;
  const { note } = req.body || {};
  const reqDoc = await confirmCompletion(id, req.user._id, note);
  // Prefer the actually paid amount, then fall back to quoted prices, then any recorded payment tx.
  let amount = Number(reqDoc.paidAmount || reqDoc.price || reqDoc.agreedPrice || 0) || 0;
  if (!amount) {
    const paymentTx = await Transaction.findOne({ requestId: reqDoc._id, type: 'payment', status: 'paid' }).sort({ createdAt: -1 });
    amount = Number(paymentTx?.finalAmount || paymentTx?.debit || 0) || 0;
  }
  if (amount > 0 && reqDoc.artisanId) {
    const alreadyCredited = await Transaction.findOne({ artisanId: reqDoc.artisanId, requestId: reqDoc._id, type: 'earning' });
    if (!alreadyCredited) {
      await Transaction.create({ artisanId: reqDoc.artisanId, credit: amount, debit: 0, type: 'earning', requestId: reqDoc._id });
    }
  }
  return res.json({ ok: true, request: reqDoc, ...dataResponse({ request: reqDoc, ok: true }) });
}

module.exports = { createRequest, addImages, getActive, getHistory, getRequestDetail, getRequestTimeline, cancelRequest, confirmRequestCompletion };



