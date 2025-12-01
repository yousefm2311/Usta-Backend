const { ApiError } = require('../errors/apiError');
const Request = require('../models/request.model');
const Artisan = require('../models/artisan.model');
const Transaction = require('../models/transaction.model');
const Notification = require('../models/notification.model');
const RequestTimeline = require('../models/requestTimeline.model');
const { dataResponse } = require('../utils/responder');

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
    .limit(50);
  return res.json(dataResponse({ requests: rows }));
}

// POST /api/artisan/requests/:id/accept
async function acceptRequest(req, res) {
  const { id } = req.params;
  const { price, note } = req.body || {};
  const reqDoc = await Request.findById(id);
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (!['new', 'assigned'].includes(reqDoc.status)) throw ApiError.badRequest('Cannot accept');
  if (reqDoc.status === 'assigned' && String(reqDoc.artisanId) !== String(req.user._id)) throw ApiError.forbidden('Assigned to another artisan');
  const agreedPrice = price !== undefined ? Number(price) : reqDoc.agreedPrice || reqDoc.price || 0;
  await Request.updateOne(
    { _id: reqDoc._id },
    { $set: { status: 'accepted', artisanId: req.user._id, acceptedAt: new Date(), agreedPrice, price: price !== undefined ? Number(price) : reqDoc.price } },
  );
  await RequestTimeline.create({ requestId: reqDoc._id, status: 'accepted', note, actorId: req.user._id });
  if (reqDoc.customerId) {
    await Notification.create({
      customerId: reqDoc.customerId,
      type: 'request',
      title: 'Request accepted',
      body: `Your request was accepted${agreedPrice ? ` with price ${agreedPrice}` : ''}.`,
    });
  }
  return res.json(dataResponse({ ok: true, agreedPrice }));
}

// POST /api/artisan/requests/:id/reject
async function rejectRequest(req, res) {
  const { id } = req.params;
  const { reason } = req.body || {};
  const reqDoc = await Request.findById(id);
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (reqDoc.status !== 'new' && String(reqDoc.artisanId) !== String(req.user._id)) throw ApiError.badRequest('Cannot reject');
  await Request.updateOne({ _id: reqDoc._id }, { $set: { status: 'rejected', rejectedAt: new Date(), artisanId: req.user._id } });
  await RequestTimeline.create({ requestId: reqDoc._id, status: 'rejected', note: reason, actorId: req.user._id });
  if (reqDoc.customerId) {
    await Notification.create({
      customerId: reqDoc.customerId,
      type: 'request',
      title: 'Request rejected',
      body: reason || 'Your request was rejected',
    });
  }
  return res.json(dataResponse({ ok: true }));
}

// GET /api/artisan/requests/active
async function getActiveRequests(req, res) {
  const rows = await Request.find({ artisanId: req.user._id, status: { $in: ['accepted', 'in_progress', 'assigned'] } })
    .sort({ updatedAt: -1 });
  return res.json(dataResponse({ requests: rows }));
}

// POST /api/artisan/requests/:id/complete
async function completeRequest(req, res) {
  const { id } = req.params;
  const reqDoc = await Request.findOne({ _id: id, artisanId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (!['accepted', 'in_progress'].includes(reqDoc.status)) throw ApiError.badRequest('Cannot complete');
  await Request.updateOne({ _id: reqDoc._id }, { $set: { status: 'completed', completedAt: new Date(), paidAmount: reqDoc.paidAmount || undefined } });
  const amount = Number(reqDoc.price || reqDoc.agreedPrice || 0) || 0;
  if (amount > 0) await Transaction.create({ artisanId: req.user._id, credit: amount, debit: 0, type: 'earning', requestId: reqDoc._id });
  await RequestTimeline.create({ requestId: reqDoc._id, status: 'completed', actorId: req.user._id });
  if (reqDoc.customerId) {
    await Notification.create({
      customerId: reqDoc.customerId,
      type: 'request',
      title: 'Request completed',
      body: 'Your request has been completed.',
    });
  }
  return res.json(dataResponse({ ok: true }));
}

// GET /api/artisan/requests/history
async function getHistory(req, res) {
  const rows = await Request.find({ artisanId: req.user._id, status: { $in: ['completed', 'cancelled', 'rejected'] } })
    .sort({ completedAt: -1 })
    .limit(200);
  return res.json(dataResponse({ requests: rows }));
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

module.exports = { getNewRequests, acceptRequest, rejectRequest, getActiveRequests, completeRequest, getHistory, getRequestDetail };
