const { ApiError } = require("../../errors/apiError");
const { dataResponse, paginatedResponse } = require("../../utils/shared/responder");
const { getPagination } = require("../../utils/shared/pagination");
const { assertObjectId } = require("../../utils/shared/objectId");
const Coupon = require("../../models/coupon.model");
const Referral = require("../../models/referral.model");
const RewardLevel = require("../../models/rewardLevel.model");
const RewardHistory = require("../../models/rewardHistory.model");
const Customer = require("../../models/customer.model");
const ActivityLog = require("../../models/activityLog.model");

function mapCoupon(coupon) {
  if (!coupon) return null;
  return {
    id: coupon._id,
    code: coupon.code,
    discountType: coupon.discountType || coupon.type || "percent",
    value: typeof coupon.value === "number" ? coupon.value : coupon.discount,
    minOrder: coupon.minOrder || 0,
    expiresAt: coupon.expiresAt,
    active: coupon.active,
    updatedAt: coupon.updatedAt,
  };
}

async function logActivity(req, action, entity, entityId, before, after) {
  try {
    await ActivityLog.create({
      actor: req?.admin
        ? { id: req.admin._id, type: "admin", name: req.admin.name }
        : undefined,
      action,
      entity,
      entityId,
      before,
      after,
    });
  } catch (err) {
    console.error("Activity log error", err);
  }
}

async function listCoupons(req, res) {
  const { page, perPage, skip } = getPagination(req);
  const [items, total] = await Promise.all([
    Coupon.find({}).sort({ updatedAt: -1 }).skip(skip).limit(perPage),
    Coupon.countDocuments({}),
  ]);
  const data = items.map(mapCoupon);
  return res.json(paginatedResponse(data, total, page, perPage));
}

async function createCoupon(req, res) {
  const { code, discountType, value, minOrder, expiresAt, active } =
    req.body || {};
  if (!code || value === undefined)
    throw ApiError.badRequest("code and value are required");
  const doc = await Coupon.create({
    code,
    discountType: discountType || "percent",
    type: discountType || "percent",
    value: Number(value),
    discount: Number(value),
    minOrder: Number(minOrder) || 0,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    active: active !== undefined ? !!active : true,
  });
  await logActivity(req, "coupon_create", "coupon", doc._id, null, doc);
  return res.status(201).json(dataResponse(mapCoupon(doc)));
}

async function updateCoupon(req, res) {
  const { code, discountType, value, minOrder, expiresAt, active } =
    req.body || {};
  assertObjectId(req.params.id, "couponId");
  const doc = await Coupon.findById(req.params.id);
  if (!doc) throw ApiError.notFound("Coupon not found");
  const before = doc.toObject();
  if (code !== undefined) doc.code = code;
  if (discountType !== undefined) {
    doc.discountType = discountType;
    doc.type = discountType;
  }
  if (value !== undefined) {
    doc.value = Number(value);
    doc.discount = Number(value);
  }
  if (minOrder !== undefined) doc.minOrder = Number(minOrder) || 0;
  if (expiresAt !== undefined)
    doc.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (active !== undefined) doc.active = !!active;
  doc.updatedAt = new Date();
  await doc.save();
  await logActivity(req, "coupon_update", "coupon", doc._id, before, doc);
  return res.json(dataResponse(mapCoupon(doc)));
}

async function deleteCoupon(req, res) {
  assertObjectId(req.params.id, "couponId");
  await Coupon.deleteOne({ _id: req.params.id });
  await logActivity(req, "coupon_delete", "coupon", req.params.id);
  return res.json({ ok: true });
}

async function marketingReferralStats(req, res) {
  const total = await Referral.countDocuments({});
  const grouped = await Referral.aggregate([
    { $group: { _id: "$customerId", total: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: 10 },
  ]);
  const ids = grouped.map((g) => g._id).filter(Boolean);
  const users = await Customer.find({ _id: { $in: ids } }).select(
    "name email phone"
  );
  const map = new Map(users.map((u) => [String(u._id), u]));
  const topReferrers = grouped.map((g) => ({
    customerId: g._id,
    customer: map.get(String(g._id)),
    total: g.total,
  }));
  return res.json(dataResponse({ totalReferrals: total, topReferrers }));
}

async function marketingRewards(req, res) {
  const levels = await RewardLevel.find({}).sort({ threshold: 1 });
  const history = await RewardHistory.find({})
    .sort({ createdAt: -1 })
    .limit(50);
  const totals = await RewardHistory.aggregate([
    {
      $group: {
        _id: null,
        earned: { $sum: { $cond: [{ $eq: ["$type", "earn"] }, "$points", 0] } },
        redeemed: {
          $sum: { $cond: [{ $eq: ["$type", "redeem"] }, "$points", 0] },
        },
      },
    },
  ]);
  const points = totals.length ? totals[0].earned - totals[0].redeemed : 0;
  return res.json(dataResponse({ levels, points, history }));
}

module.exports = {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  marketingReferralStats,
  marketingRewards,
};

