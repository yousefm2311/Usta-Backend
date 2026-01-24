const { ApiError } = require('../../errors/apiError');
const Request = require('../../models/request.model');
const RequestTimeline = require('../../models/requestTimeline.model');
const { notifyUser } = require('../../utils/shared/notify');

const ALLOWED_PRICE_STATUSES = ['priced', 'awaiting_customer_price_confirm'];

function normalizeNotes(notes) {
  if (typeof notes !== 'string') return undefined;
  const trimmed = notes.trim();
  return trimmed ? trimmed.slice(0, 500) : undefined;
}

function priceMatches(a, b) {
  const left = Number(a);
  const right = Number(b);
  if (!(left > 0) || !(right > 0)) return false;
  return Math.abs(left - right) <= 0.01;
}

// POST /api/requests/:id/price/decision
async function decidePrice(req, res) {
  const { id } = req.params;
  const { action, notes, price } = req.body || {};
  const reqDoc = await Request.findOne({ _id: id, customerId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');

  const proposedPrice = Number(reqDoc?.pricing?.proposedPrice || 0);
  if (!(proposedPrice > 0)) throw ApiError.conflict('Proposed price missing');
  if (price !== undefined && !priceMatches(price, proposedPrice)) throw ApiError.conflict('Price mismatch');

  const decision = reqDoc?.pricing?.customerDecision || 'pending';
  if (decision !== 'pending') throw ApiError.conflict('Price already decided');
  if (!ALLOWED_PRICE_STATUSES.includes(reqDoc.status)) throw ApiError.conflict('Request not awaiting price confirmation');

  const now = new Date();
  const normalizedNotes = normalizeNotes(notes);
  const isAccept = action === 'accept';
  const nextStatus = isAccept ? 'accepted' : 'price_rejected';
  const decisionValue = isAccept ? 'accepted' : 'rejected';
  const actionType = isAccept ? 'PRICE_ACCEPTED' : 'PRICE_REJECTED';

  const update = {
    $set: {
      status: nextStatus,
      'pricing.customerDecision': decisionValue,
      'pricing.customerNotes': normalizedNotes,
      'pricing.decidedAt': now,
    },
    $push: {
      timeline: {
        at: now,
        by: req.user._id,
        role: 'customer',
        action: actionType,
        meta: { price: proposedPrice, notes: normalizedNotes },
      },
    },
  };

  const updated = await Request.findOneAndUpdate(
    {
      _id: id,
      customerId: req.user._id,
      status: { $in: ALLOWED_PRICE_STATUSES },
      'pricing.proposedPrice': { $gt: 0 },
      $or: [
        { 'pricing.customerDecision': { $exists: false } },
        { 'pricing.customerDecision': 'pending' },
      ],
    },
    update,
    { new: true },
  );

  if (!updated) throw ApiError.conflict('Price already decided or status changed');

  await RequestTimeline.create({ requestId: updated._id, status: actionType, note: normalizedNotes, actorId: req.user._id });

  if (updated.artisanId) {
    const title = isAccept
      ? '\u062a\u0645\u0020\u0642\u0628\u0648\u0644\u0020\u0627\u0644\u0633\u0639\u0631\u0020\u0627\u0644\u0645\u0642\u062a\u0631\u062d'
      : '\u062a\u0645\u0020\u0631\u0641\u0636\u0020\u0627\u0644\u0633\u0639\u0631\u0020\u0627\u0644\u0645\u0642\u062a\u0631\u062d';
    const body = isAccept
      ? '\u0642\u0627\u0645\u0020\u0627\u0644\u0639\u0645\u064a\u0644\u0020\u0628\u0642\u0628\u0648\u0644\u0020\u0627\u0644\u0633\u0639\u0631\u0020\u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0020\u0648\u064a\u0645\u0643\u0646\u0647\u0020\u0627\u0644\u062f\u0641\u0639\u0020\u0627\u0644\u0622\u0646\u002e'
      : '\u0642\u0627\u0645\u0020\u0627\u0644\u0639\u0645\u064a\u0644\u0020\u0628\u0631\u0641\u0636\u0020\u0627\u0644\u0633\u0639\u0631\u0020\u0627\u0644\u0645\u0642\u062a\u0631\u062d\u002e\u0020\u064a\u0631\u062c\u0649\u0020\u062a\u0642\u062f\u064a\u0645\u0020\u0639\u0631\u0636\u0020\u062c\u062f\u064a\u062f\u002e';
    await notifyUser({
      artisanId: updated.artisanId,
      type: 'request',
      title,
      body,
      data: { requestId: String(updated._id), type: isAccept ? 'price_accepted' : 'price_rejected' },
    });
  }

  return res.json({
    id: updated._id,
    status: updated.status,
    pricing: updated.pricing,
  });
}

// GET /api/requests/:id
async function getRequestDetails(req, res) {
  const { id } = req.params;
  const reqDoc = await Request.findOne({ _id: id, customerId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  const payload = reqDoc.toObject();
  payload.timeline = payload.timeline || [];
  return res.json({ request: payload });
}

module.exports = { decidePrice, getRequestDetails };



