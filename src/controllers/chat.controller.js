const fs = require('fs');
const path = require('path');
const { ApiError } = require('../errors/apiError');
const Request = require('../models/request.model');
const Message = require('../models/message.model');
const DirectMessage = require('../models/directMessage.model');
const ChatBlock = require('../models/chatBlock.model');
const Customer = require('../models/customer.model');
const Artisan = require('../models/artisan.model');
const { getIO } = require('../socket');

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // ~3MB
const MAX_VIDEO_BYTES = 20 * 1024 * 1024; // ~20MB
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // ~5MB
const MAX_ATTACHMENTS = 3;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024; // cap per direct message
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_AUDIO_MIMES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/aac', 'audio/wav'];

function decodeBase64(base64) {
  const m = base64.match(/^data:(.*?);base64,(.*)$/);
  const mime = m ? m[1] : 'application/octet-stream';
  const data = Buffer.from(m ? m[2] : base64, 'base64');
  return { data, mime };
}

function assertImageMime(mime) {
  if (!ALLOWED_IMAGE_MIMES.includes((mime || '').toLowerCase())) throw ApiError.badRequest('Unsupported image type (only jpeg/png/webp)');
}

function assertVideoMime(mime) {
  if ((mime || '').toLowerCase() !== 'video/mp4') throw ApiError.badRequest('Unsupported video type (only mp4)');
}

function assertAudioMime(mime) {
  const lower = (mime || '').toLowerCase();
  if (!ALLOWED_AUDIO_MIMES.includes(lower)) throw ApiError.badRequest('Unsupported audio type (only mp3/ogg/aac/wav)');
}

function saveFile(dir, name, buffer, ext) {
  const uploads = path.join(process.cwd(), 'uploads', dir);
  fs.mkdirSync(uploads, { recursive: true });
  const file = path.join(uploads, `${name}.${ext}`);
  fs.writeFileSync(file, buffer);
  return `/uploads/${dir}/${path.basename(file)}`;
}

function extFromMime(mime, fallback) {
  if ((mime || '').includes('jpeg')) return 'jpg';
  if ((mime || '').includes('png')) return 'png';
  if ((mime || '').includes('webp')) return 'webp';
  if ((mime || '').includes('mp4')) return 'mp4';
  if ((mime || '').includes('mpeg') || (mime || '').includes('mp3')) return 'mp3';
  if ((mime || '').includes('ogg')) return 'ogg';
  if ((mime || '').includes('aac')) return 'aac';
  if ((mime || '').includes('wav')) return 'wav';
  return fallback;
}

async function saveImageOptimized(base64, name) {
  const { data, mime } = decodeBase64(base64);
  assertImageMime(mime);
  if (data.length > MAX_IMAGE_BYTES) throw ApiError.badRequest('Image too large (max 3MB)');
  const ext = extFromMime(mime, 'jpg');
  try {
    const sharp = require('sharp');
    const resized = await sharp(data)
      .rotate()
      .resize({ width: 1280, height: 1280, fit: 'inside' })
      .toFormat('webp', { quality: 72 });
    return saveFile('messages', name, await resized.toBuffer(), 'webp');
  } catch (err) {
    // Fallback: save original buffer
    return saveFile('messages', name, data, ext);
  }
}

function saveVideo(base64, name) {
  const { data, mime } = decodeBase64(base64);
  assertVideoMime(mime);
  if (data.length > MAX_VIDEO_BYTES) throw ApiError.badRequest('Video too large (max 20MB)');
  const ext = extFromMime(mime, 'mp4');
  return saveFile('messages', name, data, ext);
}

function saveGenericAttachment(base64, name) {
  const { data, mime } = decodeBase64(base64);
  const isVideo = (mime || '').startsWith('video/');
  const isAudio = (mime || '').startsWith('audio/');
  if (isVideo) {
    assertVideoMime(mime);
    if (data.length > MAX_VIDEO_BYTES) throw ApiError.badRequest('Video too large (max 20MB)');
    const ext = extFromMime(mime, 'mp4');
    return saveFile('messages', name, data, ext);
  }
  if (isAudio) {
    assertAudioMime(mime);
    if (data.length > MAX_AUDIO_BYTES) throw ApiError.badRequest('Audio too large (max 5MB)');
    const ext = extFromMime(mime, 'mp3');
    return saveFile('messages', name, data, ext);
  }
  assertImageMime(mime);
  if (data.length > MAX_IMAGE_BYTES) throw ApiError.badRequest('Image too large (max 3MB)');
  return saveImageOptimized(base64, name);
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
  const { requestId, type, text, image, audio, video } = req.body || {};
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
    doc.mediaPath = await saveImageOptimized(image, `${reqDoc._id}-${Date.now()}`);
    doc.mediaMime = 'image/webp';
  } else if (type === 'video') {
    if (!video) throw ApiError.badRequest('video required');
    doc.mediaPath = saveVideo(video, `${reqDoc._id}-${Date.now()}`);
    doc.mediaMime = 'video/mp4';
  } else if (type === 'audio') {
    if (!audio) throw ApiError.badRequest('audio required');
    const decoded = decodeBase64(audio);
    assertAudioMime(decoded.mime);
    if (decoded.data.length > MAX_AUDIO_BYTES) throw ApiError.badRequest('Audio too large (max 5MB)');
    const ext = extFromMime(decoded.mime, 'mp3');
    doc.mediaPath = saveFile('messages', `${reqDoc._id}-${Date.now()}`, decoded.data, ext);
    doc.mediaMime = decoded.mime || 'audio/mpeg';
  } else {
    throw ApiError.badRequest('Unsupported type');
  }
  const saved = await Message.create(doc);
  const io = getIO();
  if (io) io.to(`request:${reqDoc._id}`).emit('chat:message', { requestId: reqDoc._id, message: saved });
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
  const io = getIO();
  if (io) io.to(`request:${msg.requestId}`).to(`chat:${msg.requestId}`).emit('chat:read', { messageId: msg._id, requestId: msg.requestId, reader: req.userRole });
  return res.json({ ok: true });
}

async function listChats(req, res) {
  const match = req.userRole === 'artisan' ? { artisanId: req.user._id } : { customerId: req.user._id };
  const RequestModel = require('../models/request.model');
  const requests = await RequestModel.find({ ...match, status: { $nin: ['cancelled'] } })
    .select('description serviceType createdAt customerId artisanId')
    .lean();

  const requestIds = requests.map((r) => r._id);
  let requestChats = [];
  if (requestIds.length) {
    const grouped = await Message.aggregate([
      { $match: { requestId: { $in: requestIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$requestId', lastMessage: { $first: '$$ROOT' } } },
      { $sort: { 'lastMessage.createdAt': -1 } },
    ]);
    const map = new Map(requests.map((r) => [String(r._id), r]));
    requestChats = grouped.map((g) => {
      const meta = map.get(String(g._id)) || {};
      const chat = {
        requestId: g._id,
        serviceType: meta.serviceType,
        description: meta.description,
        createdAt: meta.createdAt,
        lastMessage: g.lastMessage,
      };
      chat.customerId = meta.customerId;
      chat.artisanId = meta.artisanId;
      return chat;
    });
  }

  // Direct chats grouped by customer/artisan pair
  const directMatch = req.userRole === 'artisan' ? { artisanId: req.user._id } : { customerId: req.user._id };
  const directGrouped = await DirectMessage.aggregate([
    { $match: directMatch },
    { $sort: { createdAt: -1 } },
    { $group: { _id: { customerId: '$customerId', artisanId: '$artisanId' }, lastMessage: { $first: '$$ROOT' } } },
    { $sort: { 'lastMessage.createdAt': -1 } },
  ]);
  const directChats = directGrouped.map((g) => ({
    customerId: g._id.customerId,
    artisanId: g._id.artisanId,
    lastMessage: g.lastMessage,
  }));

  // attach counterpart info (name, phone/email)
  const customerIds = new Set();
  const artisanIds = new Set();
  for (const chat of requestChats) {
    if (chat.customerId) customerIds.add(String(chat.customerId));
    if (chat.artisanId) artisanIds.add(String(chat.artisanId));
  }
  for (const chat of directChats) {
    if (chat.customerId) customerIds.add(String(chat.customerId));
    if (chat.artisanId) artisanIds.add(String(chat.artisanId));
  }
  const [customers, artisans] = await Promise.all([
    customerIds.size ? Customer.find({ _id: { $in: Array.from(customerIds) } }).select('name email phone').lean() : [],
    artisanIds.size ? Artisan.find({ _id: { $in: Array.from(artisanIds) } }).select('name email phone profession').lean() : [],
  ]);
  const customerMap = new Map(customers.map((c) => [String(c._id), c]));
  const artisanMap = new Map(artisans.map((a) => [String(a._id), a]));
  requestChats = requestChats.map((c) => ({ ...c, customer: c.customerId ? customerMap.get(String(c.customerId)) : undefined, artisan: c.artisanId ? artisanMap.get(String(c.artisanId)) : undefined }));
  const enrichedDirect = directChats.map((c) => ({ ...c, customer: customerMap.get(String(c.customerId)), artisan: artisanMap.get(String(c.artisanId)) }));

  return res.json({ requestChats, directChats: enrichedDirect });
}

async function getDirectInbox(req, res) {
  const isCustomer = req.userRole === 'customer';
  const filter = isCustomer ? { customerId: req.user._id, sender: 'artisan' } : { artisanId: req.user._id, sender: 'customer' };
  const msgs = await DirectMessage.find(filter).sort({ createdAt: -1 }).limit(100);
  return res.json({ messages: msgs });
}

async function ensureNotBlocked(customerId, artisanId) {
  const block = await ChatBlock.findOne({ customerId, artisanId });
  if (block) throw ApiError.forbidden('Chat blocked');
}

async function ensureArtisanCanDirectChat(customerId, artisanId) {
  const reqDoc = await Request.findOne({
    customerId,
    artisanId,
    status: { $nin: ['cancelled', 'rejected', 'closed'] },
  });
  if (reqDoc) return true;
  const hasHistory = await DirectMessage.exists({ customerId, artisanId });
  if (hasHistory) return true;
  throw ApiError.forbidden('Customer must create a request before artisan can chat');
}

// GET /api/chat/direct/:otherId
async function getDirectMessages(req, res) {
  const otherId = req.params.otherId;
  const isCustomer = req.userRole === 'customer';
  const customerId = isCustomer ? req.user._id : otherId;
  const artisanId = isCustomer ? otherId : req.user._id;
  await ensureNotBlocked(customerId, artisanId);
  if (!isCustomer) await ensureArtisanCanDirectChat(customerId, artisanId);
  const msgs = await DirectMessage.find({ customerId, artisanId }).sort({ createdAt: 1 });
  return res.json({ messages: msgs });
}

// POST /api/chat/direct/message
async function postDirectMessage(req, res) {
  const { otherId, message, attachments } = req.body || {};
  if (!otherId) throw ApiError.badRequest('otherId required');
  const isCustomer = req.userRole === 'customer';
  const customerId = isCustomer ? req.user._id : otherId;
  const artisanId = isCustomer ? otherId : req.user._id;
  const hasText = !!message;
  const attachList = Array.isArray(attachments) ? attachments : [];
  if (!hasText && !attachList.length) throw ApiError.badRequest('message or attachments required');
  if (attachList.length > MAX_ATTACHMENTS) throw ApiError.badRequest(`Too many attachments (max ${MAX_ATTACHMENTS})`);
  await ensureNotBlocked(customerId, artisanId);
  if (!isCustomer) await ensureArtisanCanDirectChat(customerId, artisanId);
  const savedAttachments = [];
  let totalBytes = 0;
  let idx = 0;
  for (const att of attachList) {
    if (!att) continue;
    const { data, mime } = decodeBase64(att);
    const isVideo = (mime || '').startsWith('video/');
    const isAudio = (mime || '').startsWith('audio/');
    if (isVideo) {
      assertVideoMime(mime);
      if (data.length > MAX_VIDEO_BYTES) throw ApiError.badRequest('Video too large (max 20MB)');
    } else if (isAudio) {
      assertAudioMime(mime);
      if (data.length > MAX_AUDIO_BYTES) throw ApiError.badRequest('Audio too large (max 5MB)');
    } else {
      assertImageMime(mime);
      if (data.length > MAX_IMAGE_BYTES) throw ApiError.badRequest('Image too large (max 3MB)');
    }
    totalBytes += data.length;
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) throw ApiError.badRequest('Attachments too large (max 20MB total)');
    const pathSaved = await saveGenericAttachment(att, `${customerId}-${artisanId}-${Date.now()}-${idx++}`);
    savedAttachments.push(pathSaved);
  }
  const doc = await DirectMessage.create({
    customerId,
    artisanId,
    sender: req.userRole,
    text: message,
    attachments: savedAttachments,
    readBy: { customer: isCustomer, artisan: !isCustomer },
  });
  const io = getIO();
  if (io) {
    const room = `direct:${customerId}:${artisanId}`;
    io.to(room).emit('direct:message', { customerId, artisanId, message: doc });
  }
  return res.status(201).json({ message: doc });
}

// POST /api/chat/block
async function blockChat(req, res) {
  const { otherId, reason } = req.body || {};
  if (!otherId) throw ApiError.badRequest('otherId required');
  const isCustomer = req.userRole === 'customer';
  const customerId = isCustomer ? req.user._id : otherId;
  const artisanId = isCustomer ? otherId : req.user._id;
  await ChatBlock.updateOne(
    { customerId, artisanId },
    { $set: { blockedBy: req.userRole, reason: reason || undefined } },
    { upsert: true },
  );
  const io = getIO();
  if (io) {
    const room = `direct:${customerId}:${artisanId}`;
    io.to(room).emit('direct:blocked', { customerId, artisanId, blockedBy: req.userRole });
  }
  return res.json({ ok: true, customerId, artisanId });
}

// POST /api/chat/unblock
async function unblockChat(req, res) {
  const { otherId } = req.body || {};
  if (!otherId) throw ApiError.badRequest('otherId required');
  const isCustomer = req.userRole === 'customer';
  const customerId = isCustomer ? req.user._id : otherId;
  const artisanId = isCustomer ? otherId : req.user._id;
  await ChatBlock.deleteOne({ customerId, artisanId });
  const io = getIO();
  if (io) {
    const room = `direct:${customerId}:${artisanId}`;
    io.to(room).emit('direct:unblocked', { customerId, artisanId });
  }
  return res.json({ ok: true, customerId, artisanId });
}

// PUT /api/chat/direct/read/:messageId
async function markDirectRead(req, res) {
  const { messageId } = req.params;
  const msg = await DirectMessage.findById(messageId);
  if (!msg) throw ApiError.notFound('Message not found');
  const isCustomer = req.userRole === 'customer';
  if (isCustomer && String(msg.customerId) !== String(req.user._id)) throw ApiError.forbidden('Not allowed');
  if (!isCustomer && String(msg.artisanId) !== String(req.user._id)) throw ApiError.forbidden('Not allowed');
  const field = isCustomer ? 'readBy.customer' : 'readBy.artisan';
  await DirectMessage.updateOne({ _id: msg._id }, { $set: { [field]: true } });
  const io = getIO();
  if (io) {
    const room = `direct:${msg.customerId}:${msg.artisanId}`;
    io.to(room).emit('direct:read', { messageId: msg._id, customerId: msg.customerId, artisanId: msg.artisanId, reader: isCustomer ? 'customer' : 'artisan' });
  }
  return res.json({ ok: true });
}

module.exports = {
  openChat,
  getMessages,
  postMessage,
  markRead,
  listChats,
  getDirectInbox,
  getDirectMessages,
  postDirectMessage,
  blockChat,
  unblockChat,
};
