const fs = require('fs');
const path = require('path');
const { ApiError } = require('../errors/apiError');
const Request = require('../models/request.model');
const Message = require('../models/message.model');

function saveBase64(dir, name, base64, ext) {
  const m = base64.match(/^data:(.*?);base64,(.*)$/);
  const data = Buffer.from(m ? m[2] : base64, 'base64');
  const uploads = path.join(process.cwd(), 'uploads', dir);
  fs.mkdirSync(uploads, { recursive: true });
  const file = path.join(uploads, `${name}.${ext}`);
  fs.writeFileSync(file, data);
  return `/uploads/${dir}/${path.basename(file)}`;
}

async function openChat(req, res) {
  const { requestId } = req.params;
  const reqDoc = await Request.findById(requestId);
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (req.userRole === 'artisan' && String(reqDoc.artisanId) !== String(req.user._id)) throw ApiError.forbidden('Not your request');
  if (req.userRole === 'customer' && String(reqDoc.customerId) !== String(req.user._id)) throw ApiError.forbidden('Not your request');
  return res.json({ ok: true, requestId });
}

async function getMessages(req, res) {
  const { requestId } = req.params;
  const reqDoc = await Request.findById(requestId);
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (req.userRole === 'artisan' && String(reqDoc.artisanId) !== String(req.user._id)) throw ApiError.forbidden('Not your request');
  if (req.userRole === 'customer' && String(reqDoc.customerId) !== String(req.user._id)) throw ApiError.forbidden('Not your request');
  const msgs = await Message.find({ requestId: reqDoc._id }).sort({ createdAt: 1 });
  return res.json({ messages: msgs });
}

async function postMessage(req, res) {
  const { requestId, type, text, image, audio } = req.body || {};
  const reqDoc = await Request.findById(requestId);
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (req.userRole === 'artisan' && String(reqDoc.artisanId) !== String(req.user._id)) throw ApiError.forbidden('Not your request');
  if (req.userRole === 'customer' && String(reqDoc.customerId) !== String(req.user._id)) throw ApiError.forbidden('Not your request');
  const sender = req.userRole;
  const doc = { requestId: reqDoc._id, sender, type, readBy: { artisan: sender === 'artisan', customer: sender === 'customer' } };
  if (type === 'text') {
    if (!text) throw ApiError.badRequest('text required');
    doc.text = text;
  } else if (type === 'image') {
    if (!image) throw ApiError.badRequest('image required');
    doc.mediaPath = saveBase64('messages', `${reqDoc._id}-${Date.now()}`, image, 'jpg');
  } else if (type === 'audio') {
    if (!audio) throw ApiError.badRequest('audio required');
    doc.mediaPath = saveBase64('messages', `${reqDoc._id}-${Date.now()}`, audio, 'mp3');
    doc.mediaMime = 'audio/mpeg';
  } else {
    throw ApiError.badRequest('Unsupported type');
  }
  const saved = await Message.create(doc);
  return res.status(201).json({ message: saved });
}

async function markRead(req, res) {
  const { messageId } = req.params;
  const msg = await Message.findById(messageId);
  if (!msg) throw ApiError.notFound('Message not found');
  const reqDoc = await Request.findById(msg.requestId);
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (req.userRole === 'artisan' && String(reqDoc.artisanId) !== String(req.user._id)) throw ApiError.forbidden('Not allowed');
  if (req.userRole === 'customer' && String(reqDoc.customerId) !== String(req.user._id)) throw ApiError.forbidden('Not allowed');
  const field = req.userRole === 'artisan' ? 'readBy.artisan' : 'readBy.customer';
  await Message.updateOne({ _id: msg._id }, { $set: { [field]: true } });
  return res.json({ ok: true });
}

async function listChats(req, res) {
  const match = req.userRole === 'artisan' ? { artisanId: req.user._id } : { customerId: req.user._id };
  const rows = await require('../models/request.model').find({ ...match, status: { $nin: ['cancelled'] } }).select('description serviceType createdAt');
  return res.json({ chats: rows });
}

module.exports = { openChat, getMessages, postMessage, markRead, listChats };
