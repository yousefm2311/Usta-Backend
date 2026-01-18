const { ApiError } = require('../../errors/apiError');
const Review = require('../../models/review.model');
const Request = require('../../models/request.model');
const Notification = require('../../models/notification.model');
const fcm = require('../../services/shared/fcm.service');

async function createReview(req, res) {
  const { artisanId } = req.params; const { rating, comment } = req.body || {};
  const r = Number(rating || 0);
  if (!(r >= 1 && r <= 5)) throw ApiError.badRequest('Rating 1..5 required');
  const completed = await Request.findOne({ artisanId, customerId: req.user._id, status: 'completed' });
  if (!completed) throw ApiError.badRequest('Complete a service before reviewing');
  const doc = await Review.create({ artisanId, customerId: req.user._id, rating: r, comment: comment || '' });
  const title = 'New review';
  const body = `You received a ${r}-star review.`;
  await Notification.create({
    artisanId,
    type: 'review',
    title,
    body,
  });
  try {
    await fcm.sendToArtisan(artisanId, title, body, {
      reviewId: String(doc._id),
      type: 'review_created',
      rating: String(r),
    });
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.status(201).json({ review: doc });
}

async function updateReview(req, res) {
  const { id } = req.params; const body = req.body || {};
  const update = {};
  if (body.rating !== undefined) {
    const r = Number(body.rating);
    if (!(r >= 1 && r <= 5)) throw ApiError.badRequest('Invalid rating');
    update.rating = r;
  }
  if (body.comment !== undefined) update.comment = String(body.comment);
  if (!Object.keys(update).length) throw ApiError.badRequest('No changes');
  const r = await Review.updateOne({ _id: id, customerId: req.user._id }, { $set: update });
  if (r.matchedCount === 0) throw ApiError.notFound('Review not found');
  return res.json({ ok: true });
}

async function deleteReview(req, res) {
  const { id } = req.params;
  const r = await Review.deleteOne({ _id: id, customerId: req.user._id });
  if (r.deletedCount === 0) throw ApiError.notFound('Review not found');
  return res.json({ ok: true });
}

async function myReviews(req, res) {
  const rows = await Review.find({ customerId: req.user._id }).sort({ createdAt: -1 });
  return res.json({ reviews: rows });
}

module.exports = { createReview, updateReview, deleteReview, myReviews };




