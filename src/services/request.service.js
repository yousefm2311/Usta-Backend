const Request = require('../models/request.model');
const RequestTimeline = require('../models/requestTimeline.model');
const Notification = require('../models/notification.model');
const { ApiError } = require('../errors/apiError');
const { getIO } = require('../socket');
const fcm = require('./fcm.service');

const STATUS = {
  PENDING: 'new',
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'in_progress',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
};
const EXPIRE_WINDOW_MS = 24 * 60 * 60 * 1000;
const AUTO_CONFIRM_WINDOW_MS = 2 * 60 * 60 * 1000;
const STALE_STATUSES = [STATUS.PENDING, STATUS.ASSIGNED];

function emitRequestEvent(event, reqDoc) {
  const io = getIO();
  if (!io || !reqDoc) return;
  const payload = {
    requestId: reqDoc._id,
    customerId: reqDoc.customerId,
    artisanId: reqDoc.artisanId,
    status: reqDoc.status,
    cancelledBy: reqDoc.cancelledBy,
  };
  io.to(`request:${reqDoc._id}`).to(`chat:${reqDoc._id}`).emit(event, payload);
  if (reqDoc.customerId) io.to(`user:${reqDoc.customerId}`).emit(event, payload);
  if (reqDoc.artisanId) {
    io.to(`user:${reqDoc.artisanId}`).emit(event, payload);
    io.to(`artisan:${reqDoc.artisanId}`).emit(event, payload);
  }
}

async function addTimeline(reqDoc, status, note, actorId) {
  await RequestTimeline.create({ requestId: reqDoc._id, status, note, actorId });
}

async function acceptRequest(id, artisanId, { price, note }) {
  const reqDoc = await Request.findOne({ _id: id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (![STATUS.PENDING, STATUS.ASSIGNED].includes(reqDoc.status)) throw ApiError.badRequest('Cannot accept');
  if (reqDoc.artisanId && String(reqDoc.artisanId) !== String(artisanId)) throw ApiError.forbidden('Assigned to another artisan');
  reqDoc.status = STATUS.ACCEPTED;
  reqDoc.artisanId = artisanId;
  if (price !== undefined) { reqDoc.agreedPrice = price; reqDoc.price = price; }
  reqDoc.acceptedAt = new Date();
  await reqDoc.save();
  await addTimeline(reqDoc, STATUS.ACCEPTED, note, artisanId);
  emitRequestEvent('request:accepted', reqDoc);
  if (reqDoc.customerId) {
    await Notification.create({
      customerId: reqDoc.customerId,
      type: 'request',
      title: 'Request accepted',
      body: 'An artisan accepted your request.',
    });
    fcm.sendToUser(reqDoc.customerId, 'تم قبول طلبك', 'الحرفي قبل طلبك', { requestId: String(reqDoc._id), type: 'accepted' });
  }
  return reqDoc;
}

async function rejectRequest(id, artisanId, reason) {
  const reqDoc = await Request.findOne({ _id: id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  if (![STATUS.PENDING, STATUS.ASSIGNED].includes(reqDoc.status)) throw ApiError.badRequest('Cannot reject');
  if (reqDoc.artisanId && String(reqDoc.artisanId) !== String(artisanId)) throw ApiError.forbidden('Assigned to another artisan');
  reqDoc.status = STATUS.REJECTED;
  reqDoc.rejectedAt = new Date();
  reqDoc.artisanId = artisanId;
  await reqDoc.save();
  await addTimeline(reqDoc, STATUS.REJECTED, reason, artisanId);
  emitRequestEvent('request:rejected', reqDoc);
  if (reqDoc.customerId) {
    await Notification.create({
      customerId: reqDoc.customerId,
      type: 'request',
      title: 'Request rejected',
      body: reason || 'Your request was rejected.',
    });
    fcm.sendToUser(reqDoc.customerId, 'تم رفض طلبك', reason || 'الحرفي رفض الطلب', { requestId: String(reqDoc._id), type: 'rejected' });
  }
  return reqDoc;
}

async function setInProgress(id, artisanId, note) {
  const reqDoc = await Request.findOneAndUpdate(
    { _id: id, artisanId, status: { $in: [STATUS.ACCEPTED] } },
    { $set: { status: STATUS.IN_PROGRESS, updatedAt: new Date() } },
    { new: true },
  );
  if (!reqDoc) throw ApiError.badRequest('Cannot start work');
  await addTimeline(reqDoc, STATUS.IN_PROGRESS, note, artisanId);
  emitRequestEvent('request:in_progress', reqDoc);
  if (reqDoc.customerId) {
    fcm.sendToUser(reqDoc.customerId, 'الحرفي بدأ العمل', 'تم بدء تنفيذ الطلب', { requestId: String(reqDoc._id), type: 'in_progress' });
  }
  return reqDoc;
}

async function completeRequest(id, artisanId, note) {
  const reqDoc = await Request.findOneAndUpdate(
    { _id: id, artisanId, status: { $in: [STATUS.ACCEPTED, STATUS.IN_PROGRESS] } },
    { $set: { status: STATUS.AWAITING_CONFIRMATION, completedAt: new Date() } },
    { new: true },
  );
  if (!reqDoc) throw ApiError.badRequest('Cannot complete');
  await addTimeline(reqDoc, STATUS.AWAITING_CONFIRMATION, note, artisanId);
  emitRequestEvent('request:awaiting_confirmation', reqDoc);
  if (reqDoc.customerId) {
    await Notification.create({
      customerId: reqDoc.customerId,
      type: 'request',
      title: 'Confirm completion',
      body: 'Artisan marked your request as completed. Please confirm.',
    });
    fcm.sendToUser(reqDoc.customerId, 'تاكيد الانهاء', 'يرجى تأكيد اكتمال الطلب', { requestId: String(reqDoc._id), type: 'awaiting_confirmation' });
  }
  return reqDoc;
}

async function expireStaleRequests({ now = new Date(), limit = 200 } = {}) {
  const fallbackCutoff = new Date(now.getTime() - EXPIRE_WINDOW_MS);
  const staleDocs = await Request.find({
    status: { $in: STALE_STATUSES },
    $or: [
      { expiresAt: { $exists: true, $lte: now } },
      { expiresAt: { $exists: false }, createdAt: { $lte: fallbackCutoff } },
    ],
  }).limit(limit);
  const expired = [];
  for (const reqDoc of staleDocs) {
    reqDoc.status = STATUS.EXPIRED;
    reqDoc.expiredAt = now;
    reqDoc.updatedAt = now;
    await reqDoc.save();
    await addTimeline(reqDoc, STATUS.EXPIRED, 'Automatically expired after 24h', null);
    emitRequestEvent('request:expired', reqDoc);
    if (reqDoc.customerId) {
      await Notification.create({
        customerId: reqDoc.customerId,
        type: 'request',
        title: 'Request expired',
        body: 'Your request expired because no artist accepted it within 24 hours.',
      });
      fcm.sendToUser(reqDoc.customerId, 'Request expired', 'Your request expired because no artist accepted it within 24 hours.', { requestId: String(reqDoc._id), type: 'expired' });
    }
    if (reqDoc.artisanId) {
      await Notification.create({
        artisanId: reqDoc.artisanId,
        type: 'request',
        title: 'Request expired',
        body: 'The pending request expired after 24 hours without confirmation.',
      });
      fcm.sendToArtisan(reqDoc.artisanId, 'Request expired', 'The pending request expired after 24 hours without confirmation.', { requestId: String(reqDoc._id), type: 'expired' });
    }
    expired.push(reqDoc);
  }
  return expired;
}

async function autoConfirmAwaitingCompletion({ now = new Date(), limit = 200 } = {}) {
  const cutoff = new Date(now.getTime() - AUTO_CONFIRM_WINDOW_MS);
  const pending = await Request.find({
    status: STATUS.AWAITING_CONFIRMATION,
    completedAt: { $exists: true, $lte: cutoff },
  }).limit(limit);
  const confirmed = [];
  for (const reqDoc of pending) {
    const note = 'Auto confirmed after 2 hours';
    try {
      const completed = await confirmCompletion(reqDoc._id, reqDoc.customerId, note);
      if (reqDoc.customerId) {
        await Notification.create({
          customerId: reqDoc.customerId,
          type: 'request',
          title: 'Request auto-completed',
          body: 'We auto-confirmed the request after 2 hours without feedback.',
        });
        fcm.sendToUser(reqDoc.customerId, 'Request auto-completed', 'We auto-confirmed the request after 2 hours without feedback.', { requestId: String(reqDoc._id), type: 'auto_completed' });
      }
      confirmed.push(completed);
    } catch (err) {
      console.error('autoConfirmAwaitingCompletion error', err);
    }
  }
  return confirmed;
}

async function confirmCompletion(id, customerId, note) {
  const reqDoc = await Request.findOneAndUpdate(
    { _id: id, customerId, status: { $in: [STATUS.AWAITING_CONFIRMATION] } },
    { $set: { status: STATUS.COMPLETED, confirmedAt: new Date() } },
    { new: true },
  );
  if (!reqDoc) throw ApiError.badRequest('Cannot confirm completion');
  await addTimeline(reqDoc, STATUS.COMPLETED, note, customerId);
  emitRequestEvent('request:completed', reqDoc);
  if (reqDoc.artisanId) {
    fcm.sendToArtisan(reqDoc.artisanId, 'تم التأكيد', 'العميل أكد اكتمال الطلب', { requestId: String(reqDoc._id), type: 'completed' });
    await Notification.create({
      artisanId: reqDoc.artisanId,
      type: 'request',
      title: 'Completion confirmed',
      body: 'Customer confirmed the job is done.',
    });
  }
  return reqDoc;
}

async function cancelByCustomer(id, customerId, reason) {
  const reqDoc = await Request.findOneAndUpdate(
    { _id: id, customerId, status: { $in: [STATUS.PENDING, STATUS.ASSIGNED, STATUS.ACCEPTED] } },
    { $set: { status: STATUS.CANCELLED, cancelledBy: 'customer', cancelledAt: new Date() } },
    { new: true },
  );
  if (!reqDoc) throw ApiError.badRequest('Cannot cancel');
  await addTimeline(reqDoc, STATUS.CANCELLED, reason, customerId);
  emitRequestEvent('request:canceled', reqDoc);
  if (reqDoc.artisanId) fcm.sendToArtisan(reqDoc.artisanId, 'طلب تم إلغاؤه', 'العميل ألغى الطلب', { requestId: String(reqDoc._id), type: 'canceled', cancelledBy: 'customer' });
  return reqDoc;
}

async function cancelByArtisan(id, artisanId, reason) {
  const reqDoc = await Request.findOneAndUpdate(
    { _id: id, artisanId, status: { $in: [STATUS.PENDING, STATUS.ASSIGNED, STATUS.ACCEPTED, STATUS.IN_PROGRESS] } },
    { $set: { status: STATUS.CANCELLED, cancelledBy: 'artisan', cancelledAt: new Date() } },
    { new: true },
  );
  if (!reqDoc) throw ApiError.badRequest('Cannot cancel');
  await addTimeline(reqDoc, STATUS.CANCELLED, reason, artisanId);
  emitRequestEvent('request:canceled', reqDoc);
  if (reqDoc.customerId) fcm.sendToUser(reqDoc.customerId, 'تم إلغاء الطلب', 'الحرفي ألغى الطلب', { requestId: String(reqDoc._id), type: 'canceled', cancelledBy: 'artisan' });
  return reqDoc;
}

module.exports = {
  STATUS,
  acceptRequest,
  rejectRequest,
  setInProgress,
  completeRequest,
  confirmCompletion,
  cancelByCustomer,
  cancelByArtisan,
  emitRequestEvent,
  expireStaleRequests,
};
