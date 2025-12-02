const jwt = require('jsonwebtoken');
const Artisan = require('./models/artisan.model');
const Customer = require('./models/customer.model');
const Request = require('./models/request.model');
const Message = require('./models/message.model');
const DirectMessage = require('./models/directMessage.model');
const ChatBlock = require('./models/chatBlock.model');
const { ApiError } = require('./errors/apiError');

let ioInstance = null;
function getIO() { return ioInstance; }

function authError(socket, message) {
  socket.emit('error', { error: message || 'Unauthorized' });
  socket.disconnect(true);
}

async function resolveUser(token) {
  if (!token) throw ApiError.unauthorized('No token');
  const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  if (!payload?.sub) throw ApiError.unauthorized('Invalid token');
  const [artisan, customer] = await Promise.all([
    Artisan.findOne({ _id: payload.sub, deleted: { $ne: true } }),
    Customer.findOne({ _id: payload.sub, deleted: { $ne: true } }),
  ]);
  if (artisan) {
    if (artisan.suspended) throw ApiError.forbidden('Account suspended');
    if (!artisan.verified) throw ApiError.forbidden('Account pending approval');
    return { user: artisan, role: 'artisan' };
  }
  if (customer) {
    if (customer.blocked) throw ApiError.forbidden('Account blocked');
    return { user: customer, role: 'customer' };
  }
  throw ApiError.unauthorized('Account not found');
}

async function authorizeRequestAccess(requestId, user, role) {
  const reqDoc = await Request.findById(requestId);
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (role === 'artisan' && String(reqDoc.artisanId) !== String(user._id)) throw ApiError.forbidden('Not your request');
  if (role === 'customer' && String(reqDoc.customerId) !== String(user._id)) throw ApiError.forbidden('Not your request');
  return reqDoc;
}

async function ensureNotBlocked(customerId, artisanId) {
  const block = await ChatBlock.findOne({ customerId, artisanId });
  if (block) throw ApiError.forbidden('Chat blocked');
}

async function customerHasRequestForArtisan(customerId, artisanId) {
  const reqDoc = await Request.findOne({
    customerId,
    artisanId,
    status: { $nin: ['cancelled', 'rejected', 'closed'] },
  });
  return !!reqDoc;
}

function initSockets(io) {
  ioInstance = io;
  io.on('connection', async (socket) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      const { user, role } = await resolveUser(token);
      socket.data.user = user;
      socket.data.role = role;
      socket.join(`user:${user._id}`);
      if (role === 'artisan') socket.join(`artisan:${user._id}`);
      socket.emit('connected', { userId: user._id, role });
    } catch (err) {
      authError(socket, err.message || 'Unauthorized');
      return;
    }

    socket.on('chat:subscribe', async ({ requestId }) => {
      try {
        await authorizeRequestAccess(requestId, socket.data.user, socket.data.role);
        const reqDoc = await Request.findById(requestId);
        if (reqDoc?.customerId && reqDoc?.artisanId) await ensureNotBlocked(reqDoc.customerId, reqDoc.artisanId);
        socket.join(`request:${requestId}`);
        socket.join(`chat:${requestId}`); // alias room name
        socket.emit('chat:subscribed', { requestId });
      } catch (err) {
        socket.emit('error', { error: err.message || 'Subscribe failed' });
      }
    });

    socket.on('chat:message', async ({ requestId, message }) => {
      try {
        if (!message) throw ApiError.badRequest('message required');
        const reqDoc = await authorizeRequestAccess(requestId, socket.data.user, socket.data.role);
        if (reqDoc?.customerId && reqDoc?.artisanId) await ensureNotBlocked(reqDoc.customerId, reqDoc.artisanId);
        const saved = await Message.create({
          requestId: reqDoc._id,
          sender: socket.data.role,
          type: 'text',
          text: message,
          attachments: [],
          readBy: { artisan: socket.data.role === 'artisan', customer: socket.data.role === 'customer' },
        });
        io.to(`request:${requestId}`).to(`chat:${requestId}`).emit('chat:message', { requestId, message: saved });
        console.log('[socket] chat:message', requestId, saved._id);
      } catch (err) {
        socket.emit('error', { error: err.message || 'Send failed' });
      }
    });

    socket.on('location:update', async ({ lat, lng, requestId }) => {
      try {
        if (socket.data.role !== 'artisan') throw ApiError.forbidden('Only artisans can send location');
        if (!(lat !== undefined && lng !== undefined)) throw ApiError.badRequest('lat/lng required');
        await Artisan.updateOne({ _id: socket.data.user._id }, { $set: { location: { type: 'Point', coordinates: [lng, lat] }, locationUpdatedAt: new Date() } });
        if (requestId) {
          // ensure artisan owns the request before broadcasting
          await authorizeRequestAccess(requestId, socket.data.user, socket.data.role);
          io.to(`request:${requestId}`).emit('artisan:location', { requestId, lat, lng, updatedAt: new Date() });
        }
        socket.emit('location:ack', { lat, lng });
      } catch (err) {
        socket.emit('error', { error: err.message || 'Location failed' });
      }
    });

    // Direct chat (pre-request) between customer and artisan
    socket.on('direct:subscribe', async ({ artisanId, customerId }) => {
      try {
        const artisan = artisanId ? await Artisan.findById(artisanId) : null;
        const customer = customerId ? await Customer.findById(customerId) : null;
        const role = socket.data.role;
        let cId = customer ? customer._id : null;
        let aId = artisan ? artisan._id : null;
        if (role === 'customer') { cId = socket.data.user._id; if (!aId) throw ApiError.badRequest('artisanId required'); }
        if (role === 'artisan') { aId = socket.data.user._id; if (!cId) throw ApiError.badRequest('customerId required'); }
        await ensureNotBlocked(cId, aId);
        if (role === 'artisan') {
          const allowed = await customerHasRequestForArtisan(cId, aId);
          if (!allowed) {
            const hasHistory = await DirectMessage.exists({ customerId: cId, artisanId: aId });
            if (!hasHistory) throw ApiError.forbidden('You can subscribe only after the customer created a request for you');
          }
        }
        const room = `direct:${cId}:${aId}`;
        socket.join(room);
        socket.emit('direct:subscribed', { room, customerId: cId, artisanId: aId });
      } catch (err) {
        socket.emit('error', { error: err.message || 'Direct subscribe failed' });
      }
    });

    socket.on('direct:message', async ({ artisanId, customerId, message, attachments }) => {
      try {
        const role = socket.data.role;
        let cId = customerId;
        let aId = artisanId;
        if (role === 'customer') cId = socket.data.user._id;
        if (role === 'artisan') aId = socket.data.user._id;
        if (!aId || !cId) throw ApiError.badRequest('artisanId and customerId required');
        if (!message) throw ApiError.badRequest('message required');
        await ensureNotBlocked(cId, aId);
        if (role === 'artisan') {
          const allowed = await customerHasRequestForArtisan(cId, aId);
          if (!allowed) {
            const hasHistory = await DirectMessage.exists({ customerId: cId, artisanId: aId });
            if (!hasHistory) throw ApiError.forbidden('You can reply only after the customer created a request for you');
          }
        }
        const doc = await DirectMessage.create({
          customerId: cId,
          artisanId: aId,
          sender: role,
          text: message,
          attachments: Array.isArray(attachments) ? attachments : [],
          readBy: { customer: role === 'customer', artisan: role === 'artisan' },
        });
        const room = `direct:${cId}:${aId}`;
        io.to(room).emit('direct:message', { customerId: cId, artisanId: aId, message: doc });
        console.log('[socket] direct:message', room, doc._id);
      } catch (err) {
        socket.emit('error', { error: err.message || 'Direct message failed' });
      }
    });

    socket.on('direct:block', async ({ artisanId, customerId, reason }) => {
      try {
        const role = socket.data.role;
        let cId = customerId;
        let aId = artisanId;
        if (role === 'customer') cId = socket.data.user._id;
        if (role === 'artisan') aId = socket.data.user._id;
        if (!aId || !cId) throw ApiError.badRequest('artisanId and customerId required');
        await ChatBlock.updateOne(
          { customerId: cId, artisanId: aId },
          { $set: { blockedBy: role, reason: reason || undefined } },
          { upsert: true },
        );
        socket.emit('direct:blocked', { customerId: cId, artisanId: aId });
        ioInstance?.to(`direct:${cId}:${aId}`).emit('direct:blocked', { customerId: cId, artisanId: aId, blockedBy: role });
      } catch (err) {
        socket.emit('error', { error: err.message || 'Block failed' });
      }
    });

    socket.on('direct:unblock', async ({ artisanId, customerId }) => {
      try {
        const role = socket.data.role;
        let cId = customerId;
        let aId = artisanId;
        if (role === 'customer') cId = socket.data.user._id;
        if (role === 'artisan') aId = socket.data.user._id;
        if (!aId || !cId) throw ApiError.badRequest('artisanId and customerId required');
        await ChatBlock.deleteOne({ customerId: cId, artisanId: aId });
        socket.emit('direct:unblocked', { customerId: cId, artisanId: aId });
        ioInstance?.to(`direct:${cId}:${aId}`).emit('direct:unblocked', { customerId: cId, artisanId: aId });
      } catch (err) {
        socket.emit('error', { error: err.message || 'Unblock failed' });
      }
    });
  });
}

module.exports = { initSockets, getIO };
