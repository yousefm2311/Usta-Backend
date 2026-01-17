const Complaint = require('../models/complaint.model');
const { ApiError } = require('../errors/apiError');
const { dataResponse } = require('../utils/responder');
const fcm = require('../services/fcm.service');

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
  const { issue, customerId, requestId, type, attachments, message } = req.body || {};
  if (!issue) throw ApiError.badRequest('issue required');
  const payload = {
    artisanId: req.user._id,
    customerId: customerId || undefined,
    createdByType: 'artisan',
    createdById: req.user._id,
    requestId: requestId || undefined,
    type: type || undefined,
    issue,
    attachments: Array.isArray(attachments) ? attachments : [],
    status: 'open',
    messages: message ? [buildMessage('artisan', req.user._id, message, attachments)] : [],
  };
  const doc = await Complaint.create(payload);
  try {
    await fcm.sendToTopic(
      'role_admins',
      'New complaint',
      issue,
      { complaintId: String(doc._id), type: 'complaint_created', source: 'artisan' }
    );
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.status(201).json(dataResponse(doc));
}

function getPagination(req) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage || req.query.limit || '20', 10)));
  return { page, perPage, skip: (page - 1) * perPage };
}

// GET /api/artisan/complaints
async function listComplaints(req, res) {
  const { status } = req.query;
  const { page, perPage, skip } = getPagination(req);
  const filter = { artisanId: req.user._id };
  if (status) filter.status = status;
  const [rows, total] = await Promise.all([
    Complaint.find(filter).sort({ createdAt: -1 }).skip(skip).limit(perPage),
    Complaint.countDocuments(filter),
  ]);
  return res.json({ data: rows, pagination: { total, page, perPage } });
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
  try {
    await fcm.sendToTopic(
      'role_admins',
      'Complaint message',
      message,
      { complaintId: String(doc._id), type: 'complaint_message', source: 'artisan' }
    );
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.status(201).json(dataResponse(msg));
}

module.exports = { createComplaint, listComplaints, getComplaint, postMessage };
