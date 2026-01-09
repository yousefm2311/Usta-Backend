const { ApiError } = require('../errors/apiError');
const Request = require('../models/request.model');
const Artisan = require('../models/artisan.model');
const Transaction = require('../models/transaction.model');
const Notification = require('../models/notification.model');
const RequestTimeline = require('../models/requestTimeline.model');
const { dataResponse } = require('../utils/responder');
const requestService = require('../services/request.service');

// GET /api/artisan/requests/new
async function getNewRequests(req, res) {
  const serviceNames = (req.user.services || []).map((s) => s.name);
  const rows = await Request.find({
    $or: [
      { status: 'new', serviceType: { $in: serviceNames } },
      { status: 'assigned', artisanId: req.user._id },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('customerId', 'name email phone address');
  const requests = rows.map((requestDoc) => {
    const request = requestDoc.toObject({ getters: true });
    request.customer = request.customerId
      ? {
          _id: request.customerId._id,
          name: request.customerId.name,
          email: request.customerId.email,
          phone: request.customerId.phone,
          address: request.customerId.address,
        }
      : null;
    request.customerName = request.customer?.name || null;
    delete request.customerId;
    return request;
  });
  return res.json(dataResponse({ requests }));
}

// POST /api/artisan/requests/:id/accept
async function acceptRequest(req, res) {
  const { id } = req.params;
  const { price, note } = req.body || {};
  const reqDoc = await requestService.acceptRequest(id, req.user._id, { price, note });
  return res.json(dataResponse({ ok: true, request: reqDoc }));
}

// POST /api/artisan/requests/:id/reject
async function rejectRequest(req, res) {
  const { id } = req.params;
  const { reason } = req.body || {};
  const reqDoc = await requestService.rejectRequest(id, req.user._id, reason);
  return res.json(dataResponse({ ok: true, request: reqDoc }));
}

// GET /api/artisan/requests/active
async function getActiveRequests(req, res) {
  const rows = await Request.find({
    artisanId: req.user._id,
    status: { $in: ['accepted', 'in_progress', 'assigned', 'awaiting_confirmation', 'price_rejected', 'priced', 'awaiting_customer_price_confirm'] },
  })
    .sort({ updatedAt: -1 })
    .populate('customerId', 'name email phone address');
  const requests = rows.map((requestDoc) => {
    const request = requestDoc.toObject({ getters: true });
    request.customer = request.customerId
      ? {
          _id: request.customerId._id,
          name: request.customerId.name,
          email: request.customerId.email,
          phone: request.customerId.phone,
          address: request.customerId.address,
        }
      : null;
    request.customerName = request.customer?.name || null;
    delete request.customerId;
    return request;
  });
  return res.json(dataResponse({ requests }));
}

// POST /api/artisan/requests/:id/timeline
async function updateRequestTimeline(req, res) {
  const { id } = req.params;
  const { status, note } = req.body || {};
  const normalized = typeof status === 'string' ? status.trim() : '';
  const allowed = ['on_the_way', 'arrived', 'work_started', 'in_progress', 'completed'];
  if (!normalized || !allowed.includes(normalized)) throw ApiError.badRequest('Invalid status');
  const sanitizedNote = typeof note === 'string' ? note.trim().slice(0, 200) : '';

  const reqDoc = await Request.findOne({ _id: id, artisanId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (['completed', 'cancelled', 'rejected', 'closed', 'expired'].includes(reqDoc.status)) throw ApiError.badRequest('Cannot update closed request');
  if (!['accepted', 'in_progress'].includes(reqDoc.status)) throw ApiError.badRequest('Accept request first');

  if (normalized === 'completed') {
    // Delegate to existing completion flow so earnings & notifications stay intact
    req.body.note = sanitizedNote;
    return completeRequest(req, res);
  }

  if (normalized === 'in_progress') {
    const updated = await requestService.setInProgress(id, req.user._id, sanitizedNote);
    const timeline = await RequestTimeline.find({ requestId: reqDoc._id }).sort({ createdAt: 1 });
    return res.json(dataResponse({ status: updated.status, timeline }));
  }

  await RequestTimeline.create({ requestId: reqDoc._id, status: normalized, note: sanitizedNote, actorId: req.user._id });
  if (reqDoc.customerId) {
    await Notification.create({
      customerId: reqDoc.customerId,
      type: 'request',
      title: 'Request update',
      body: `Status updated to ${normalized}${sanitizedNote ? ` - ${sanitizedNote}` : ''}`,
    });
  }
  const timeline = await RequestTimeline.find({ requestId: reqDoc._id }).sort({ createdAt: 1 });
  return res.json(dataResponse({ status: reqDoc.status, timeline }));
}

// POST /api/artisan/requests/:id/complete
async function completeRequest(req, res) {
  const { id } = req.params;
  const { note } = req.body || {};
  const reqDoc = await requestService.completeRequest(id, req.user._id, note);
  return res.json(dataResponse({ ok: true, status: reqDoc.status }));
}

// GET /api/artisan/requests/history
async function getHistory(req, res) {
  const rows = await Request.find({ artisanId: req.user._id, status: { $in: ['completed', 'cancelled', 'rejected', 'expired'] } })
    .sort({ completedAt: -1 })
    .limit(200)
    .populate('customerId', 'name email phone');
  const ids = rows.map((r) => r._id);
  const timelines = await RequestTimeline.find({ requestId: { $in: ids } }).sort({ createdAt: 1 });
  const byRequest = timelines.reduce((acc, t) => {
    const key = String(t.requestId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});
  const requests = rows.map((r) => {
    const obj = r.toObject();
    obj.customer = r.customerId ? {
      _id: r.customerId._id,
      name: r.customerId.name,
      email: r.customerId.email,
      phone: r.customerId.phone,
    } : null;
    obj.customerName = r.customerId?.name || null;
    obj.timeline = byRequest[String(r._id)] || [];
    return obj;
  });
  return res.json(dataResponse({ requests }));
}

// GET /api/artisan/requests/:id/timeline
async function getRequestTimeline(req, res) {
  const { id } = req.params;
  const reqDoc = await Request.findOne({ _id: id, artisanId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  const steps = await RequestTimeline.find({ requestId: reqDoc._id }).sort({ createdAt: 1 });
  return res.json(dataResponse({ data: steps }));
}

// GET /api/artisan/requests/:id
async function getRequestDetail(req, res) {
  const { id } = req.params;
  const reqDoc = await Request.findOne({ _id: id, artisanId: req.user._id })
    .populate('customerId', 'name email phone address');
  if (!reqDoc) throw ApiError.notFound('Request not found');
  const timeline = await RequestTimeline.find({ requestId: reqDoc._id }).sort({ createdAt: 1 });
  const payload = reqDoc.toObject();
  payload.customer = reqDoc.customerId;
  return res.json(dataResponse({ request: payload, timeline }));
}

module.exports = { getNewRequests, acceptRequest, rejectRequest, getActiveRequests, updateRequestTimeline, completeRequest, getHistory, getRequestDetail, getRequestTimeline };
