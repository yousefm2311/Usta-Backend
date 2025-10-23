const fs = require('fs');
const path = require('path');
const { ApiError } = require('../errors/apiError');
const Request = require('../models/request.model');

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
  const { serviceType, artisanId, description, lat, lng, images } = req.body || {};
  if (!serviceType && !artisanId) throw ApiError.badRequest('serviceType or artisanId required');
  const doc = {
    customerId: req.user._id,
    artisanId: artisanId || null,
    serviceType: serviceType || null,
    description: description || '',
    images: [],
    status: artisanId ? 'assigned' : 'new',
  };
  if (typeof lat === 'number' && typeof lng === 'number') doc.location = { type: 'Point', coordinates: [lng, lat] };
  if (Array.isArray(images)) {
    for (const img of images) doc.images.push(saveBase64Image('requests', `${Date.now()}-${Math.random().toString(36).slice(2,6)}`, img));
  }
  const saved = await Request.create(doc);
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
  const rows = await Request.find({ customerId: req.user._id, status: { $nin: ['completed', 'cancelled', 'rejected'] } }).sort({ createdAt: -1 });
  return res.json({ requests: rows });
}

async function getHistory(req, res) {
  const rows = await Request.find({ customerId: req.user._id, status: { $in: ['completed', 'cancelled', 'rejected'] } }).sort({ createdAt: -1 });
  return res.json({ requests: rows });
}

async function cancelRequest(req, res) {
  const { id } = req.params;
  const reqDoc = await Request.findOne({ _id: id, customerId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (['accepted', 'in_progress', 'completed'].includes(reqDoc.status)) throw ApiError.badRequest('Cannot cancel now');
  await Request.updateOne({ _id: reqDoc._id }, { $set: { status: 'cancelled', cancelledAt: new Date() } });
  return res.json({ ok: true });
}

module.exports = { createRequest, addImages, getActive, getHistory, cancelRequest };

