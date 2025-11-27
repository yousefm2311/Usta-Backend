const jwt = require('jsonwebtoken');
const Artisan = require('./models/artisan.model');
const Customer = require('./models/customer.model');
const Request = require('./models/request.model');
const Message = require('./models/message.model');
const DirectMessage = require('./models/directMessage.model');
const { ApiError } = require('./errors/apiError');

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

function initSockets(io) {
  io.on('connection', async (socket) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      const { user, role } = await resolveUser(token);
      socket.data.user = user;
      socket.data.role = role;
      socket.join(`user:${user._id}`);
      socket.emit('connected', { userId: user._id, role });
    } catch (err) {
      authError(socket, err.message || 'Unauthorized');
      return;
    }

    socket.on('chat:subscribe', async ({ requestId }) => {
      try {
        await authorizeRequestAccess(requestId, socket.data.user, socket.data.role);
        socket.join(`request:${requestId}`);
        socket.emit('chat:subscribed', { requestId });
      } catch (err) {
        socket.emit('error', { error: err.message || 'Subscribe failed' });
      }
    });

    socket.on('chat:message', async ({ requestId, message }) => {
      try {
        if (!message) throw ApiError.badRequest('message required');
        const reqDoc = await authorizeRequestAccess(requestId, socket.data.user, socket.data.role);
        const saved = await Message.create({
          requestId: reqDoc._id,
          sender: socket.data.role,
          type: 'text',
          text: message,
          attachments: [],
          readBy: { artisan: socket.data.role === 'artisan', customer: socket.data.role === 'customer' },
        });
        io.to(`request:${requestId}`).emit('chat:message', { requestId, message: saved });
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
        const doc = await DirectMessage.create({
          customerId: cId,
          artisanId: aId,
          sender: role,
          text: message,
          attachments: Array.isArray(attachments) ? attachments : [],
        });
        const room = `direct:${cId}:${aId}`;
        io.to(room).emit('direct:message', { customerId: cId, artisanId: aId, message: doc });
      } catch (err) {
        socket.emit('error', { error: err.message || 'Direct message failed' });
      }
    });
  });
}

module.exports = { initSockets };
