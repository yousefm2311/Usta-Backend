const Complaint = require('../models/complaint.model');
const { ApiError } = require('../errors/apiError');
const { dataResponse } = require('../utils/responder');

function buildMessage(senderType, senderId, message, attachments) {
  return {
    senderType,
    senderId,
    message,
    attachments: Array.isArray(attachments) ? attachments : [],
    createdAt: new Date(),
  };
}

// POST /api/artisan/complaints
async function createComplaint(req, res) {
  const { issue, customerId, attachments, message } = req.body || {};
  if (!issue) throw ApiError.badRequest('issue required');
  const payload = {
    artisanId: req.user._id,
    customerId: customerId || undefined,
    issue,
    attachments: Array.isArray(attachments) ? attachments : [],
    status: 'open',
    messages: message ? [buildMessage('artisan', req.user._id, message, attachments)] : [],
  };
  const doc = await Complaint.create(payload);
  return res.status(201).json(dataResponse(doc));
}

// GET /api/artisan/complaints
async function listComplaints(req, res) {
  const rows = await Complaint.find({ artisanId: req.user._id }).sort({ createdAt: -1 });
  return res.json(dataResponse(rows));
}

// GET /api/artisan/complaints/:id
async function getComplaint(req, res) {
  const doc = await Complaint.findOne({ _id: req.params.id, artisanId: req.user._id });
  if (!doc) throw ApiError.notFound('Complaint not found');
  return res.json(dataResponse(doc));
}

// POST /api/artisan/complaints/:id/messages
async function postMessage(req, res) {
  const { message, attachments } = req.body || {};
  if (!message) throw ApiError.badRequest('message required');
  const doc = await Complaint.findOne({ _id: req.params.id, artisanId: req.user._id });
  if (!doc) throw ApiError.notFound('Complaint not found');
  const msg = buildMessage('artisan', req.user._id, message, attachments);
  await Complaint.updateOne({ _id: doc._id }, { $push: { messages: msg }, $set: { updatedAt: new Date() } });
  return res.status(201).json(dataResponse(msg));
}

module.exports = { createComplaint, listComplaints, getComplaint, postMessage };
