const { ApiError } = require("../../errors/apiError");
const { dataResponse, paginatedResponse } = require("../../utils/shared/responder");
const { getPagination } = require("../../utils/shared/pagination");
const { assertObjectId } = require("../../utils/shared/objectId");
const { notifyUser } = require("../../utils/shared/notify");
const Request = require("../../models/request.model");
const RequestTimeline = require("../../models/requestTimeline.model");
const Message = require("../../models/message.model");
const Transaction = require("../../models/transaction.model");
const Artisan = require("../../models/artisan.model");
const Customer = require("../../models/customer.model");
const ActivityLog = require("../../models/activityLog.model");
const fcm = require("../../services/shared/fcm.service");
const { getRequestTimeline } = require("./requests.controller");

async function recordTimeline(requestId, status, note, actorId) {
  if (!requestId || !status) return null;
  return RequestTimeline.create({ requestId, status, note, actorId });
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

async function listOrders(req, res) {
  const { status } = req.query;
  const { page, perPage, skip } = getPagination(req);
  const filter = {};
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    Request.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .populate("customerId", "name email phone")
      .populate("artisanId", "name email phone profession"),
    Request.countDocuments(filter),
  ]);
  const data = items.map((r) => ({
    ...r.toObject(),
    customer: r.customerId,
    artisan: r.artisanId,
  }));
  return res.json(paginatedResponse(data, total, page, perPage));
}

async function getOrder(req, res) {
  assertObjectId(req.params.id, "orderId");
  const row = await Request.findById(req.params.id)
    .populate("customerId", "name email phone")
    .populate("artisanId", "name email phone profession pricing services");
  if (!row) throw ApiError.notFound("Order not found");
  const payload = {
    ...row.toObject(),
    customer: row.customerId,
    artisan: row.artisanId,
  };
  return res.json({ order: payload, ...dataResponse(payload) });
}

async function getOrderTimeline(req, res) {
  return getRequestTimeline(req, res);
}

async function addOrderTimeline(req, res) {
  const { status, note } = req.body || {};
  const normalized = status === "canceled" ? "cancelled" : status;
  const allowed = [
    "new",
    "assigned",
    "accepted",
    "in_progress",
    "completed",
    "cancelled",
    "rejected",
    "closed",
  ];
  if (!normalized || !allowed.includes(normalized))
    throw ApiError.badRequest("Invalid status");
  assertObjectId(req.params.id, "orderId");
  const request = await Request.findById(req.params.id);
  if (!request) throw ApiError.notFound("Order not found");
  const before = { status: request.status };
  await Request.updateOne(
    { _id: request._id },
    { $set: { status: normalized, updatedAt: new Date() } }
  );
  await recordTimeline(request._id, normalized, note, req.admin?._id);
  await logActivity(req, "order_timeline_add", "request", request._id, before, {
    status: normalized,
  });
  if (request.customerId) {
    try {
      await fcm.sendToUser(
        request.customerId,
        "Request status updated",
        `Status changed to ${normalized}`,
        {
          requestId: String(request._id),
          type: "status_update",
          status: normalized,
        }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  if (request.artisanId) {
    try {
      await fcm.sendToArtisan(
        request.artisanId,
        "Request status updated",
        `Status changed to ${normalized}`,
        {
          requestId: String(request._id),
          type: "status_update",
          status: normalized,
        }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return getRequestTimeline(req, res);
}

async function cancelOrder(req, res) {
  const { reason, note } = req.body || {};
  assertObjectId(req.params.id, "orderId");
  const request = await Request.findById(req.params.id);
  if (!request) throw ApiError.notFound("Order not found");
  const finalNote = note || reason;
  await Request.updateOne(
    { _id: request._id },
    { $set: { status: "cancelled", updatedAt: new Date() } }
  );
  await recordTimeline(request._id, "cancelled", finalNote, req.admin?._id);
  await logActivity(
    req,
    "order_cancel",
    "request",
    request._id,
    { status: request.status },
    { status: "cancelled", note: finalNote }
  );
  if (request.customerId) {
    try {
      await fcm.sendToUser(
        request.customerId,
        "Request cancelled",
        finalNote || "Your request was cancelled by admin.",
        { requestId: String(request._id), type: "cancelled" }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  if (request.artisanId) {
    try {
      await fcm.sendToArtisan(
        request.artisanId,
        "Request cancelled",
        finalNote || "The request was cancelled by admin.",
        { requestId: String(request._id), type: "cancelled" }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  const updated = await Request.findById(req.params.id)
    .populate("customerId", "name email phone")
    .populate("artisanId", "name email phone profession");
  const payload = {
    ...updated.toObject(),
    customer: updated.customerId,
    artisan: updated.artisanId,
  };
  return res.json(dataResponse(payload));
}

async function closeOrder(req, res) {
  const { note } = req.body || {};
  assertObjectId(req.params.id, "orderId");
  const request = await Request.findById(req.params.id);
  if (!request) throw ApiError.notFound("Order not found");
  await Request.updateOne(
    { _id: request._id },
    { $set: { status: "closed", updatedAt: new Date() } }
  );
  await recordTimeline(request._id, "closed", note, req.admin?._id);
  await logActivity(
    req,
    "order_close",
    "request",
    request._id,
    { status: request.status },
    { status: "closed", note }
  );
  if (request.customerId) {
    try {
      await fcm.sendToUser(
        request.customerId,
        "Request closed",
        "Your request was closed by admin.",
        { requestId: String(request._id), type: "closed" }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  if (request.artisanId) {
    try {
      await fcm.sendToArtisan(
        request.artisanId,
        "Request closed",
        "The request was closed by admin.",
        { requestId: String(request._id), type: "closed" }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  const updated = await Request.findById(req.params.id)
    .populate("customerId", "name email phone")
    .populate("artisanId", "name email phone profession");
  const payload = {
    ...updated.toObject(),
    customer: updated.customerId,
    artisan: updated.artisanId,
  };
  return res.json(dataResponse(payload));
}

async function listOrderMessages(req, res) {
  assertObjectId(req.params.id, "orderId");
  const request = await Request.findById(req.params.id);
  if (!request) throw ApiError.notFound("Order not found");
  const messages = await Message.find({ requestId: request._id }).sort({
    createdAt: 1,
  });
  return res.json(dataResponse({ messages }));
}

async function postOrderMessage(req, res) {
  const { message, attachments } = req.body || {};
  if (!message) throw ApiError.badRequest("message required");
  assertObjectId(req.params.id, "orderId");
  const request = await Request.findById(req.params.id);
  if (!request) throw ApiError.notFound("Order not found");
  const msg = await Message.create({
    requestId: request._id,
    sender: "admin",
    type: "text",
    text: message,
    attachments: Array.isArray(attachments) ? attachments : [],
    createdAt: new Date(),
  });
  await logActivity(req, "order_message", "request", request._id, null, msg);
  if (request.customerId) {
    try {
      await fcm.sendToUser(
        request.customerId,
        "New admin message",
        message,
        {
          requestId: String(request._id),
          type: "admin_message",
          messageId: String(msg._id),
        }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  if (request.artisanId) {
    try {
      await fcm.sendToArtisan(
        request.artisanId,
        "New admin message",
        message,
        {
          requestId: String(request._id),
          type: "admin_message",
          messageId: String(msg._id),
        }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.status(201).json(dataResponse(msg));
}

async function walletSummary(req, res) {
  const artisanAgg = await Transaction.aggregate([
    { $match: { artisanId: { $ne: null } } },
    {
      $group: {
        _id: "$artisanId",
        totalCredit: { $sum: "$credit" },
        totalDebit: { $sum: "$debit" },
      },
    },
  ]);
  const customerAgg = await Transaction.aggregate([
    { $match: { customerId: { $ne: null } } },
    {
      $group: {
        _id: "$customerId",
        totalCredit: { $sum: "$credit" },
        totalDebit: { $sum: "$debit" },
      },
    },
  ]);
  const artisanIds = artisanAgg.map((a) => a._id);
  const customerIds = customerAgg.map((c) => c._id);
  const [artisans, customers] = await Promise.all([
    Artisan.find({ _id: { $in: artisanIds } }).select("name email profession"),
    Customer.find({ _id: { $in: customerIds } }).select("name email"),
  ]);
  const artisanMap = new Map(artisans.map((a) => [String(a._id), a]));
  const customerMap = new Map(customers.map((c) => [String(c._id), c]));
  const artisanBalances = artisanAgg.map((a) => ({
    userId: a._id,
    type: "artisan",
    balance: (a.totalCredit || 0) - (a.totalDebit || 0),
    totalCredit: a.totalCredit || 0,
    totalDebit: a.totalDebit || 0,
    user: artisanMap.get(String(a._id)),
  }));
  const customerBalances = customerAgg.map((c) => ({
    userId: c._id,
    type: "customer",
    balance: (c.totalCredit || 0) - (c.totalDebit || 0),
    totalCredit: c.totalCredit || 0,
    totalDebit: c.totalDebit || 0,
    user: customerMap.get(String(c._id)),
  }));
  return res.json(
    dataResponse({ artisans: artisanBalances, customers: customerBalances })
  );
}

async function getPayout(req, res) {
  assertObjectId(req.params.id, "payoutId");
  const trx = await Transaction.findById(req.params.id);
  if (!trx) throw ApiError.notFound("Payout not found");
  const artisan = trx.artisanId
    ? await Artisan.findById(trx.artisanId).select(
        "name email profession paymentMethod"
      )
    : null;
  const payload = {
    ...trx.toObject(),
    artisan,
    bankInfo: artisan?.paymentMethod,
  };
  return res.json(dataResponse(payload));
}

async function updatePayoutStatus(req, res) {
  const { status } = req.body || {};
  const allowed = ["pending", "approved", "rejected", "failed", "done"];
  if (!allowed.includes(status || ""))
    throw ApiError.badRequest("Invalid status");
  assertObjectId(req.params.id, "payoutId");
  const trx = await Transaction.findById(req.params.id);
  if (!trx) throw ApiError.notFound("Payout not found");
  await Transaction.updateOne(
    { _id: trx._id },
    { $set: { status, updatedAt: new Date() } }
  );
  await logActivity(
    req,
    "payout_status",
    "transaction",
    trx._id,
    { status: trx.status },
    { status }
  );
  const title = "Payout status updated";
  const body = `Status changed to ${status}`;
  if (trx.artisanId) {
    await notifyUser({
      artisanId: trx.artisanId,
      type: "payout",
      title,
      body,
      data: {
        transactionId: String(trx._id),
        type: "payout_status",
        status,
      },
    });
  }
  if (trx.customerId) {
    await notifyUser({
      customerId: trx.customerId,
      type: "payment",
      title,
      body,
      data: {
        transactionId: String(trx._id),
        type: "payout_status",
        status,
      },
    });
  }
  return res.json(dataResponse({ status }));
}

module.exports = {
  listOrders,
  getOrder,
  getOrderTimeline,
  addOrderTimeline,
  cancelOrder,
  closeOrder,
  listOrderMessages,
  postOrderMessage,
  walletSummary,
  getPayout,
  updatePayoutStatus,
};


