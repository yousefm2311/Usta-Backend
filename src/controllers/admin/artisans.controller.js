const { ApiError } = require("../../errors/apiError");
const { dataResponse } = require("../../utils/shared/responder");
const { assertObjectId } = require("../../utils/shared/objectId");
const { notifyUser } = require("../../utils/shared/notify");
const Artisan = require("../../models/artisan.model");
const Review = require("../../models/review.model");

async function listArtisans(req, res) {
  const rows = await Artisan.find({})
    .select("-password")
    .limit(200)
    .sort({ createdAt: -1 });
  return res.json({ artisans: rows });
}

async function getArtisan(req, res) {
  assertObjectId(req.params.id, "artisanId");
  const row = await Artisan.findById(req.params.id).select("-password");
  if (!row) throw ApiError.notFound("Not found");
  return res.json({ artisan: row });
}

async function approveArtisan(req, res) {
  assertObjectId(req.params.id, "artisanId");
  await Artisan.updateOne(
    { _id: req.params.id },
    { $set: { verified: true, suspended: false } }
  );
  await notifyUser({
    artisanId: req.params.id,
    type: "account",
    title: "Account approved",
    body: "Your account has been approved by admin.",
    data: { type: "account_approved" },
  });
  return res.json({ ok: true });
}

async function rejectArtisan(req, res) {
  assertObjectId(req.params.id, "artisanId");
  await Artisan.updateOne({ _id: req.params.id }, { $set: { deleted: true } });
  await notifyUser({
    artisanId: req.params.id,
    type: "account",
    title: "Account rejected",
    body: "Your account has been rejected by admin.",
    data: { type: "account_rejected" },
  });
  return res.json({ ok: true });
}

async function updateArtisanStatus(req, res) {
  assertObjectId(req.params.id, "artisanId");
  const { suspended } = req.body || {};
  await Artisan.updateOne(
    { _id: req.params.id },
    { $set: { suspended: !!suspended } }
  );
  const title = suspended ? "Account suspended" : "Account reactivated";
  const body = suspended
    ? "Your account has been suspended by admin."
    : "Your account has been reactivated by admin.";
  await notifyUser({
    artisanId: req.params.id,
    type: "account",
    title,
    body,
    data: { type: "account_suspension", suspended: !!suspended },
  });
  return res.json({ ok: true });
}

async function filterArtisans(req, res) {
  const { category, rating } = req.query;
  const filter = {};
  if (category) filter.profession = { $regex: category, $options: "i" };
  const base = await Artisan.find(filter).select("-password").limit(200);
  if (!rating) return res.json({ artisans: base });
  const min = Number(rating) || 0;
  const agg = await Review.aggregate([
    { $group: { _id: "$artisanId", avg: { $avg: "$rating" } } },
    { $match: { avg: { $gte: min } } },
  ]);
  const allowed = new Set(agg.map((a) => String(a._id)));
  const filtered = base.filter((a) => allowed.has(String(a._id)));
  return res.json({ artisans: filtered });
}

async function approveArtisanBody(req, res) {
  const { artisanId } = req.body || {};
  if (!artisanId) throw ApiError.badRequest("artisanId required");
  assertObjectId(artisanId, "artisanId");
  await Artisan.updateOne(
    { _id: artisanId },
    { $set: { verified: true, suspended: false } }
  );
  await notifyUser({
    artisanId,
    type: "account",
    title: "Account approved",
    body: "Your account has been approved by admin.",
    data: { type: "account_approved" },
  });
  return res.json(dataResponse({ artisanId, approved: true }));
}

async function rejectArtisanBody(req, res) {
  const { artisanId, reason } = req.body || {};
  if (!artisanId) throw ApiError.badRequest("artisanId required");
  assertObjectId(artisanId, "artisanId");
  await Artisan.updateOne(
    { _id: artisanId },
    { $set: { deleted: true, rejectionReason: reason } }
  );
  const body = reason
    ? `Your account was rejected: ${reason}`
    : "Your account has been rejected by admin.";
  await notifyUser({
    artisanId,
    type: "account",
    title: "Account rejected",
    body,
    data: { type: "account_rejected" },
  });
  return res.json(dataResponse({ artisanId, rejected: true, reason }));
}

module.exports = {
  listArtisans,
  getArtisan,
  approveArtisan,
  rejectArtisan,
  updateArtisanStatus,
  filterArtisans,
  approveArtisanBody,
  rejectArtisanBody,
};

