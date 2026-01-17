const Request = require('../models/request.model');
const RequestTimeline = require('../models/requestTimeline.model');
const Notification = require('../models/notification.model');
const Artisan = require('../models/artisan.model');
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
  PRICED: 'priced',
  AWAITING_CUSTOMER_PRICE_CONFIRM: 'awaiting_customer_price_confirm',
  PRICE_REJECTED: 'price_rejected',
  NEED_NEW_PRICE: 'need_new_price',
  ON_THE_WAY: 'on_the_way',
  ARRIVED: 'arrived',
  WORK_STARTED: 'work_started',
  WORKING: 'working',
};
const EXPIRE_WINDOW_MS = 24 * 60 * 60 * 1000;
const AUTO_CONFIRM_WINDOW_MS = 2 * 60 * 60 * 1000;
const STALE_STATUSES = [STATUS.PENDING, STATUS.ASSIGNED];
const DEFAULT_BROADCAST_RADIUS_KM = Number(
  process.env.REQUEST_BROADCAST_RADIUS_KM || 30,
);

function buildRequestPayload(reqDoc) {
  return {
    requestId: reqDoc._id,
    customerId: reqDoc.customerId,
    artisanId: reqDoc.artisanId,
    status: reqDoc.status,
    cancelledBy: reqDoc.cancelledBy,
  };
}

function emitRequestEvent(event, reqDoc) {
  const io = getIO();
  if (!io || !reqDoc) return;
  const payload = buildRequestPayload(reqDoc);
  io.to(`request:${reqDoc._id}`).to(`chat:${reqDoc._id}`).emit(event, payload);
  if (reqDoc.customerId) io.to(`user:${reqDoc.customerId}`).emit(event, payload);
  if (reqDoc.artisanId) {
    io.to(`user:${reqDoc.artisanId}`).emit(event, payload);
    io.to(`artisan:${reqDoc.artisanId}`).emit(event, payload);
  }
}

async function emitRequestToMatchingArtisans(
  event,
  reqDoc,
  { radiusKm = DEFAULT_BROADCAST_RADIUS_KM, excludeArtisanId } = {},
) {
  const io = getIO();
  if (!io || !reqDoc?.serviceType) return;

  const query = {
    verified: true,
    suspended: { $ne: true },
    deleted: { $ne: true },
    services: { $elemMatch: { name: reqDoc.serviceType } },
  };

  if (excludeArtisanId) {
    query._id = { $ne: excludeArtisanId };
  }

  if (
    reqDoc.location &&
    Array.isArray(reqDoc.location.coordinates) &&
    reqDoc.location.coordinates.length === 2
  ) {
    query.location = {
      $near: {
        $geometry: reqDoc.location,
        $maxDistance: radiusKm * 1000,
      },
    };
  }

  const artisans = await Artisan.find(query).select('_id').lean();
  if (!artisans.length) return;
  const payload = buildRequestPayload(reqDoc);
  for (const art of artisans) {
    const id = String(art._id);
    io.to(`user:${id}`).to(`artisan:${id}`).emit(event, payload);
  }
  try {
    const ids = artisans.map((a) => String(a._id));
    const tokens = await fcm.getTokensByIds(Artisan, ids);
    if (tokens.length) {
      await fcm.sendToTokens(
        tokens,
        'طلب جديد',
        `فيه طلب جديد قريب منك${reqDoc.serviceType ? ` لخدمة ${reqDoc.serviceType}` : ''}`,
        { requestId: String(reqDoc._id), type: 'new_request' },
      );
    }
  } catch (_) {
    // Best-effort FCM broadcast.
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
  const wasBroadcast = reqDoc.status === STATUS.PENDING;
  const normalizedPrice = price !== undefined ? Number(price) : undefined;
  const hasPrice = normalizedPrice !== undefined && !Number.isNaN(normalizedPrice) && normalizedPrice > 0;
  reqDoc.status = hasPrice ? STATUS.AWAITING_CUSTOMER_PRICE_CONFIRM : STATUS.ACCEPTED;
  reqDoc.artisanId = artisanId;
  if (hasPrice) {
    reqDoc.pricing = reqDoc.pricing || {};
    reqDoc.pricing.proposedPrice = normalizedPrice;
    reqDoc.pricing.customerDecision = 'pending';
    reqDoc.price = normalizedPrice;
    reqDoc.agreedPrice = normalizedPrice;
  } else {
    // No price provided: treat as accepted without price confirmation.
    reqDoc.pricing = reqDoc.pricing || {};
    reqDoc.pricing.customerDecision = 'accepted';
    reqDoc.pricing.proposedPrice = undefined;
    reqDoc.pricing.customerNotes = undefined;
    reqDoc.pricing.decidedAt = new Date();
    reqDoc.price = undefined;
    reqDoc.agreedPrice = undefined;
  }
  reqDoc.acceptedAt = new Date();
  await reqDoc.save();
  await addTimeline(reqDoc, reqDoc.status, note, artisanId);
  emitRequestEvent('request:accepted', reqDoc);
  if (wasBroadcast) {
    await emitRequestToMatchingArtisans('request:accepted', reqDoc, {
      excludeArtisanId: artisanId,
    });
  }
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
  const allowedStatuses = [
    STATUS.ACCEPTED,
    STATUS.ON_THE_WAY,
    STATUS.ARRIVED,
    STATUS.WORK_STARTED,
    STATUS.IN_PROGRESS,
    'on_the_way',
    'arrived',
    'work_started',
    'in_progress',
  ].filter((s) => typeof s === 'string' && s.length);
  const reqDoc = await Request.findOneAndUpdate(
    {
      _id: id,
      artisanId,
      status: {
        $in: allowedStatuses,
      },
    },
    { $set: { status: STATUS.IN_PROGRESS, updatedAt: new Date() } },
    { new: true },
  );
  if (!reqDoc) throw ApiError.badRequest('Cannot start work');
  await addTimeline(reqDoc, STATUS.IN_PROGRESS, note, artisanId);
  emitRequestEvent('request:in_progress', reqDoc);
  if (reqDoc.customerId) {
    await Notification.create({
      customerId: reqDoc.customerId,
      type: 'request',
      title: 'Work started',
      body: 'The artisan started working on your request.',
    });
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
  if (reqDoc.artisanId) {
    await Notification.create({
      artisanId: reqDoc.artisanId,
      type: 'request',
      title: 'Request cancelled',
      body: 'The customer cancelled the request.',
    });
    fcm.sendToArtisan(
      reqDoc.artisanId,
      'طلب تم إلغاؤه',
      'العميل ألغى الطلب',
      { requestId: String(reqDoc._id), type: 'canceled', cancelledBy: 'customer' },
    );
  }
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
  if (reqDoc.customerId) {
    await Notification.create({
      customerId: reqDoc.customerId,
      type: 'request',
      title: 'Request cancelled',
      body: 'The artisan cancelled the request.',
    });
    fcm.sendToUser(
      reqDoc.customerId,
      'تم إلغاء الطلب',
      'الحرفي ألغى الطلب',
      { requestId: String(reqDoc._id), type: 'canceled', cancelledBy: 'artisan' },
    );
  }
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
  emitRequestToMatchingArtisans,
  expireStaleRequests,
};
