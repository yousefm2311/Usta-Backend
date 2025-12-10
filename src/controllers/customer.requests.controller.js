const fs = require('fs');
const path = require('path');
const { ApiError } = require('../errors/apiError');
const Request = require('../models/request.model');
const RequestTimeline = require('../models/requestTimeline.model');
const Notification = require('../models/notification.model');
const Transaction = require('../models/transaction.model');
const { emitRequestEvent, cancelByCustomer, confirmCompletion } = require('../services/request.service');

function saveBase64Image(dir, name, base64) {
  const m = base64.match(/^data:(.*?);base64,(.*)$/);
  const data = Buffer.from(m ? m[2] : base64, 'base64');
  const uploads = path.join(process.cwd(), 'uploads', dir);
  fs.mkdirSync(uploads, { recursive: true });
  const file = path.join(uploads, `${name}.jpg`);
  fs.writeFileSync(file, data);
  return `/uploads/${dir}/${path.basename(file)}`;
}

// POST /api/customer/requests
async function createRequest(req, res) {
  const { serviceType, artisanId, description, lat, lng, address, images } = req.body || {};
  if (!serviceType && !artisanId) throw ApiError.badRequest('serviceType or artisanId required');
  const hasLat = typeof lat === 'number';
  const hasLng = typeof lng === 'number';
  if (hasLat !== hasLng) throw ApiError.badRequest('lat and lng are required together');
  const doc = {
    customerId: req.user._id,
    artisanId: artisanId || null,
    serviceType: serviceType || null,
    description: description || '',
    images: [],
    status: artisanId ? 'assigned' : 'new',
    address: address || undefined,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
  if (hasLat && hasLng) doc.location = { type: 'Point', coordinates: [lng, lat] };
  if (Array.isArray(images)) {
    for (const img of images) doc.images.push(saveBase64Image('requests', `${Date.now()}-${Math.random().toString(36).slice(2,6)}`, img));
  }
  const saved = await Request.create(doc);
  if (saved.artisanId) {
    await Notification.create({
      artisanId: saved.artisanId,
      type: 'request',
      title: 'New request assigned',
      body: `You have a new request${saved.serviceType ? ` for ${saved.serviceType}` : ''}.`,
    });
  }
  await RequestTimeline.create({ requestId: saved._id, status: saved.status, actorId: req.user._id });
  emitRequestEvent('request:new', saved);
  return res.status(201).json({ request: saved });
}

// POST /api/customer/requests/:id/images
async function addImages(req, res) {
  const { id } = req.params;
  const body = req.body || {};
  const reqDoc = await Request.findOne({ _id: id, customerId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  const newPaths = [];
  for (const img of body.images || []) newPaths.push(saveBase64Image('requests', `${id}-${Date.now()}`, img));
  await Request.updateOne({ _id: reqDoc._id }, { $push: { images: { $each: newPaths } } });
  return res.json({ images: newPaths });
}

async function getActive(req, res) {
  const rows = await Request.find({ customerId: req.user._id, status: { $nin: ['completed', 'cancelled', 'rejected', 'expired'] } }).sort({ createdAt: -1 });
  return res.json({ requests: rows });
}

async function getHistory(req, res) {
  const rows = await Request.find({ customerId: req.user._id, status: { $in: ['completed', 'cancelled', 'rejected', 'expired'] } }).sort({ createdAt: -1 });
  return res.json({ requests: rows });
}

async function getRequestDetail(req, res) {
  const row = await Request.findOne({ _id: req.params.id, customerId: req.user._id })
    .populate('artisanId', 'name email phone profession services pricing')
    .populate('customerId', 'name email phone');
  if (!row) throw ApiError.notFound('Request not found');
  const payload = { ...row.toObject(), customer: row.customerId, artisan: row.artisanId };
  return res.json({ request: payload });
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
  return res.json({ ok: true, request: updated });
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
  return res.json({ ok: true, request: reqDoc });
}

module.exports = { createRequest, addImages, getActive, getHistory, getRequestDetail, getRequestTimeline, cancelRequest, confirmRequestCompletion };
