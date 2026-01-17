const fs = require("fs");
const path = require("path");
const os = require("os");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ApiError } = require("../errors/apiError");
const { dataResponse, paginatedResponse } = require("../utils/responder");
const Admin = require("../models/admin.model");
const Customer = require("../models/customer.model");
const Artisan = require("../models/artisan.model");
const Category = require("../models/category.model");
const Request = require("../models/request.model");
const RequestTimeline = require("../models/requestTimeline.model");
const Report = require("../models/report.model");
const Transaction = require("../models/transaction.model");
const Review = require("../models/review.model");
const Notification = require("../models/notification.model");
const Setting = require("../models/settings.model");
const Complaint = require("../models/complaint.model");
const NotificationTemplate = require("../models/notificationTemplate.model");
const ActivityLog = require("../models/activityLog.model");
const Role = require("../models/role.model");
const RewardLevel = require("../models/rewardLevel.model");
const RewardHistory = require("../models/rewardHistory.model");
const Referral = require("../models/referral.model");
const Coupon = require("../models/coupon.model");
const Message = require("../models/message.model");
const requestService = require("../services/request.service");
const fcm = require("../services/fcm.service");

function signAdmin(admin) {
  const secret = process.env.JWT_SECRET || "dev-secret";
  const tokenVersion = admin.tokenVersion || 0;
  return jwt.sign(
    { sub: String(admin._id), role: admin.role, kind: "admin", tokenVersion },
    secret,
    { expiresIn: "8h" }
  );
}

function getPagination(req) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(req.query.perPage || req.query.limit || "20", 10))
  );
  return { page, perPage, skip: (page - 1) * perPage };
}

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

function resolveComplaintOwner(complaint) {
  if (complaint?.createdByType && complaint?.createdById) {
    return { type: complaint.createdByType, id: complaint.createdById };
  }
  if (complaint?.customerId && !complaint?.artisanId) {
    return { type: 'customer', id: complaint.customerId };
  }
  if (complaint?.artisanId && !complaint?.customerId) {
    return { type: 'artisan', id: complaint.artisanId };
  }
  const firstMsg = Array.isArray(complaint?.messages) ? complaint.messages[0] : null;
  if (firstMsg?.senderType === 'customer') {
    return { type: 'customer', id: complaint.customerId };
  }
  if (firstMsg?.senderType === 'artisan') {
    return { type: 'artisan', id: complaint.artisanId };
  }
  if (complaint?.customerId) return { type: 'customer', id: complaint.customerId };
  if (complaint?.artisanId) return { type: 'artisan', id: complaint.artisanId };
  return null;
}

function resolveReportOwner(report) {
  if (report?.customerId && !report?.artisanId) {
    return { type: "customer", id: report.customerId };
  }
  if (report?.artisanId && !report?.customerId) {
    return { type: "artisan", id: report.artisanId };
  }
  if (report?.customerId) return { type: "customer", id: report.customerId };
  if (report?.artisanId) return { type: "artisan", id: report.artisanId };
  return null;
}

// Auth & Access
async function adminLogin(req, res) {
  const { email, password } = req.body || {};
  const admin = await Admin.findOne({ email, deleted: { $ne: true } });
  if (!admin) throw ApiError.unauthorized("Invalid credentials");
  const ok = await bcrypt.compare(password, admin.password);
  if (!ok) throw ApiError.unauthorized("Invalid credentials");
  return res.json({
    token: signAdmin(admin),
    admin: {
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    },
  });
}

async function adminCreate(req, res) {
  const { name, email, password, role } = req.body || {};
  const exists = await Admin.findOne({ email });
  if (exists) throw ApiError.conflict("Email already used");
  const hash = await bcrypt.hash(password, 10);
  const doc = await Admin.create({
    name,
    email,
    password: hash,
    role: role || "viewer",
  });
  return res
    .status(201)
    .json({
      admin: { _id: doc._id, name: doc.name, email: doc.email, role: doc.role },
    });
}

async function adminChangePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  const ok = await bcrypt.compare(currentPassword, req.admin.password);
  if (!ok) throw ApiError.badRequest("Current password incorrect");
  const hash = await bcrypt.hash(newPassword, 10);
  await Admin.updateOne(
    { _id: req.admin._id },
    {
      $set: { password: hash, lastLogoutAt: new Date() },
      $inc: { tokenVersion: 1 },
    }
  );
  return res.json({ message: "Password changed" });
}

async function adminLogout(req, res) {
  await Admin.updateOne(
    { _id: req.admin._id },
    { $inc: { tokenVersion: 1 }, $set: { lastLogoutAt: new Date() } }
  );
  return res.json({ ok: true, message: "Logged out" });
}
async function adminVerifyRole(req, res) {
  return res.json({
    role: req.admin.role,
    admin: { _id: req.admin._id, name: req.admin.name, email: req.admin.email },
  });
}

// Customers Management
async function listCustomers(req, res) {
  const rows = await Customer.find({})
    .select("-password")
    .limit(200)
    .sort({ createdAt: -1 });
  return res.json({ customers: rows });
}
async function getCustomer(req, res) {
  const row = await Customer.findById(req.params.id).select("-password");
  if (!row) throw ApiError.notFound("Not found");
  return res.json({ customer: row });
}
async function blockCustomer(req, res) {
  const { id } = req.params;
  const { blocked } = req.body || {};
  await Customer.updateOne({ _id: id }, { $set: { blocked: !!blocked } });
  const title = blocked ? "Account blocked" : "Account unblocked";
  const body = blocked
    ? "Your account has been blocked by admin."
    : "Your account has been unblocked by admin.";
  await Notification.create({
    customerId: id,
    type: "account",
    title,
    body,
  });
  try {
    await fcm.sendToUser(id, title, body, {
      type: "account_status",
      blocked: !!blocked,
    });
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.json({ ok: true });
}
async function deleteCustomer(req, res) {
  const { id } = req.params;
  await Customer.updateOne({ _id: id }, { $set: { deleted: true } });
  const title = "Account deleted";
  const body = "Your account has been deleted by admin.";
  await Notification.create({
    customerId: id,
    type: "account",
    title,
    body,
  });
  try {
    await fcm.sendToUser(id, title, body, { type: "account_deleted" });
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.json({ ok: true });
}
async function searchCustomers(req, res) {
  const q = (req.query.query || "").trim();
  const rows = await Customer.find({
    $or: [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ],
  })
    .select("-password")
    .limit(100);
  return res.json({ customers: rows });
}

async function blockCustomerBody(req, res) {
  const { customerId, blocked } = req.body || {};
  if (!customerId) throw ApiError.badRequest("customerId required");
  await Customer.updateOne(
    { _id: customerId },
    { $set: { blocked: blocked === undefined ? true : !!blocked } }
  );
  const isBlocked = blocked === undefined ? true : !!blocked;
  const title = isBlocked ? "Account blocked" : "Account unblocked";
  const body = isBlocked
    ? "Your account has been blocked by admin."
    : "Your account has been unblocked by admin.";
  await Notification.create({
    customerId,
    type: "account",
    title,
    body,
  });
  try {
    await fcm.sendToUser(customerId, title, body, {
      type: "account_status",
      blocked: isBlocked,
    });
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.json(
    dataResponse({
      customerId,
      blocked: blocked === undefined ? true : !!blocked,
    })
  );
}

// Artisans Management
async function listArtisans(req, res) {
  const rows = await Artisan.find({})
    .select("-password")
    .limit(200)
    .sort({ createdAt: -1 });
  return res.json({ artisans: rows });
}
async function getArtisan(req, res) {
  const row = await Artisan.findById(req.params.id).select("-password");
  if (!row) throw ApiError.notFound("Not found");
  return res.json({ artisan: row });
}
async function approveArtisan(req, res) {
  await Artisan.updateOne(
    { _id: req.params.id },
    { $set: { verified: true, suspended: false } }
  );
  await Notification.create({
    artisanId: req.params.id,
    type: "account",
    title: "Account approved",
    body: "Your account has been approved by admin.",
  });
  try {
    await fcm.sendToArtisan(
      req.params.id,
      "Account approved",
      "Your account has been approved by admin.",
      { type: "account_approved" }
    );
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.json({ ok: true });
}
async function rejectArtisan(req, res) {
  await Artisan.updateOne({ _id: req.params.id }, { $set: { deleted: true } });
  await Notification.create({
    artisanId: req.params.id,
    type: "account",
    title: "Account rejected",
    body: "Your account has been rejected by admin.",
  });
  try {
    await fcm.sendToArtisan(
      req.params.id,
      "Account rejected",
      "Your account has been rejected by admin.",
      { type: "account_rejected" }
    );
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.json({ ok: true });
}
async function updateArtisanStatus(req, res) {
  const { suspended } = req.body || {};
  await Artisan.updateOne(
    { _id: req.params.id },
    { $set: { suspended: !!suspended } }
  );
  const title = suspended ? "Account suspended" : "Account reactivated";
  const body = suspended
    ? "Your account has been suspended by admin."
    : "Your account has been reactivated by admin.";
  await Notification.create({
    artisanId: req.params.id,
    type: "account",
    title,
    body,
  });
  try {
    await fcm.sendToArtisan(req.params.id, title, body, {
      type: "account_suspension",
      suspended: !!suspended,
    });
  } catch (_) {
    // Best-effort FCM send.
  }
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
  await Artisan.updateOne(
    { _id: artisanId },
    { $set: { verified: true, suspended: false } }
  );
  await Notification.create({
    artisanId,
    type: "account",
    title: "Account approved",
    body: "Your account has been approved by admin.",
  });
  try {
    await fcm.sendToArtisan(
      artisanId,
      "Account approved",
      "Your account has been approved by admin.",
      { type: "account_approved" }
    );
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.json(dataResponse({ artisanId, approved: true }));
}

async function rejectArtisanBody(req, res) {
  const { artisanId, reason } = req.body || {};
  if (!artisanId) throw ApiError.badRequest("artisanId required");
  await Artisan.updateOne(
    { _id: artisanId },
    { $set: { deleted: true, rejectionReason: reason } }
  );
  await Notification.create({
    artisanId,
    type: "account",
    title: "Account rejected",
    body: reason
      ? `Your account was rejected: ${reason}`
      : "Your account has been rejected by admin.",
  });
  try {
    await fcm.sendToArtisan(
      artisanId,
      "Account rejected",
      reason
        ? `Your account was rejected: ${reason}`
        : "Your account has been rejected by admin.",
      { type: "account_rejected" }
    );
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.json(dataResponse({ artisanId, rejected: true, reason }));
}

// Categories
async function listCategories(req, res) {
  const rows = await Category.find({}).sort({ name: 1 });
  return res.json({ categories: rows });
}
async function createCategory(req, res) {
  const doc = await Category.create({ name: req.body.name });
  return res.status(201).json({ category: doc });
}
async function updateCategory(req, res) {
  await Category.updateOne(
    { _id: req.params.id },
    { $set: { name: req.body.name } }
  );
  return res.json({ ok: true });
}
async function deleteCategory(req, res) {
  await Category.deleteOne({ _id: req.params.id });
  return res.json({ ok: true });
}

// Requests
// async function listRequests(req, res) { const rows = await Request.find({}).sort({ createdAt: -1 }).limit(200); return res.json({ requests: rows }); }
async function listRequests(req, res) {
  try {
    const rows = await Request.find({})
      .populate("customerId", "name phone email")
      .populate("artisanId", "name phone email profession")
      .sort({ createdAt: -1 })
      .limit(200);

    // نرجعها بشكل ثابت في الـ JSON
    const data = rows.map((r) => ({
      ...r.toObject(),
      customer: r.customerId,
      artisan: r.artisanId,
    }));

    return res.json({ requests: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getRequest(req, res) {
  const row = await Request.findById(req.params.id)
    .populate("customerId", "name email phone")
    .populate("artisanId", "name email phone profession pricing services");
  if (!row) throw ApiError.notFound("Not found");
  const timeline = await RequestTimeline.find({ requestId: row._id }).sort({
    createdAt: 1,
  });
  const payload = {
    ...row.toObject(),
    customer: row.customerId,
    artisan: row.artisanId,
    timeline: timeline.length
      ? timeline
      : [
          {
            status: "created",
            note: "Request created",
            createdAt: row.createdAt,
          },
        ],
  };
  return res.json({ request: payload, ...dataResponse(payload) });
}
async function filterRequests(req, res) {
  const { status } = req.query;
  const rows = await Request.find(status ? { status } : {})
    .sort({ createdAt: -1 })
    .limit(200);
  return res.json({ requests: rows });
}
async function expireStaleRequests(req, res) {
  const { limit, before } = req.body || {};
  let parsedBefore;
  if (before !== undefined) {
    parsedBefore = new Date(before);
    if (Number.isNaN(parsedBefore.getTime())) throw ApiError.badRequest('Invalid before date');
  }
  const docs = await requestService.expireStaleRequests({
    now: parsedBefore || undefined,
    limit: limit ? Number(limit) : undefined,
  });
  return res.json(dataResponse({ expiredCount: docs.length, requestIds: docs.map((r) => r._id) }));
}
async function autoConfirmRequests(req, res) {
  const { limit, before } = req.body || {};
  let parsedBefore;
  if (before !== undefined) {
    parsedBefore = new Date(before);
    if (Number.isNaN(parsedBefore.getTime())) throw ApiError.badRequest('Invalid before date');
  }
  const docs = await requestService.autoConfirmAwaitingCompletion({
    now: parsedBefore || undefined,
    limit: limit ? Number(limit) : undefined,
  });
  return res.json(dataResponse({ confirmedCount: docs.length, requestIds: docs.map((r) => r._id) }));
}
async function deleteRequest(req, res) {
  const existing = await Request.findById(req.params.id).select(
    "customerId artisanId serviceType"
  );
  await Request.deleteOne({ _id: req.params.id });
  if (existing?.customerId) {
    const title = "Request removed";
    const body = existing.serviceType
      ? `Your request for ${existing.serviceType} was removed by admin.`
      : "Your request was removed by admin.";
    await Notification.create({
      customerId: existing.customerId,
      type: "request",
      title,
      body,
    });
    try {
      await fcm.sendToUser(existing.customerId, title, body, {
        requestId: String(req.params.id),
        type: "request_removed",
      });
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  if (existing?.artisanId) {
    const title = "Request removed";
    const body = existing.serviceType
      ? `A request for ${existing.serviceType} was removed by admin.`
      : "A request was removed by admin.";
    await Notification.create({
      artisanId: existing.artisanId,
      type: "request",
      title,
      body,
    });
    try {
      await fcm.sendToArtisan(existing.artisanId, title, body, {
        requestId: String(req.params.id),
        type: "request_removed",
      });
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json({ ok: true });
}
async function updateRequestStatus(req, res) {
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
  const existing = await Request.findById(req.params.id);
  if (!existing) throw ApiError.notFound("Not found");
  const set = { status: normalized, updatedAt: new Date() };
  if (normalized === "assigned" && req.body.artisanId)
    set.artisanId = req.body.artisanId;
  await Request.updateOne({ _id: existing._id }, { $set: set });
  await recordTimeline(existing._id, normalized, note, req.admin?._id);
  await logActivity(
    req,
    "request_status_updated",
    "request",
    existing._id,
    { status: existing.status },
    { status: normalized }
  );
  if (normalized === "assigned" && req.body.artisanId) {
    await Notification.create({
      artisanId: req.body.artisanId,
      type: "request",
      title: "New request assigned",
      body: `A request was assigned to you${existing.serviceType ? `: ${existing.serviceType}` : ""}.`,
    });
    try {
      await fcm.sendToArtisan(
        req.body.artisanId,
        "New request assigned",
        `A request was assigned to you${existing.serviceType ? `: ${existing.serviceType}` : ""}.`,
        { requestId: String(existing._id), type: "assigned" }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  if (existing.customerId) {
    await Notification.create({
      customerId: existing.customerId,
      type: "request",
      title: "Request status updated",
      body: `Status changed to ${normalized}`,
    });
    try {
      await fcm.sendToUser(
        existing.customerId,
        "Request status updated",
        `Status changed to ${normalized}`,
        { requestId: String(existing._id), type: "status_update", status: normalized }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  const artisanId = req.body.artisanId || existing.artisanId;
  if (artisanId) {
    try {
      await fcm.sendToArtisan(
        artisanId,
        "Request status updated",
        `Status changed to ${normalized}`,
        { requestId: String(existing._id), type: "status_update", status: normalized }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json({ ok: true, ...dataResponse({ status: normalized }) });
}

async function getRequestTimeline(req, res) {
  const request = await Request.findById(req.params.id);
  if (!request) throw ApiError.notFound("Request not found");
  const events = await RequestTimeline.find({ requestId: request._id }).sort({
    createdAt: 1,
  });
  const baseEvent = {
    status: "created",
    note: "Request created",
    createdAt: request.createdAt,
  };
  const data = events.length ? [baseEvent, ...events] : [baseEvent];
  return res.json(dataResponse(data));
}

async function closeOrCancelRequest(req, res) {
  const { status, note } = req.body || {};
  const normalized = status === "canceled" ? "cancelled" : status;
  if (!["closed", "cancelled"].includes(normalized || ""))
    throw ApiError.badRequest("Status must be closed or cancelled");
  const request = await Request.findById(req.params.id);
  if (!request) throw ApiError.notFound("Request not found");
  const before = { status: request.status };
  await Request.updateOne(
    { _id: request._id },
    { $set: { status: normalized, updatedAt: new Date() } }
  );
  await recordTimeline(request._id, normalized, note, req.admin?._id);
  await logActivity(req, "request_closed", "request", request._id, before, {
    status: normalized,
  });
  if (request.customerId) {
    try {
      await fcm.sendToUser(
        request.customerId,
        "Request status updated",
        `Status changed to ${normalized}`,
        { requestId: String(request._id), type: "status_update", status: normalized }
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
        { requestId: String(request._id), type: "status_update", status: normalized }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json({ ok: true, ...dataResponse({ status: normalized }) });
}

// Reports
async function listReports(req, res) {
  const rows = await Report.find({}).sort({ createdAt: -1 }).limit(200);
  return res.json({ reports: rows });
}
async function getReport(req, res) {
  const row = await Report.findById(req.params.id);
  if (!row) throw ApiError.notFound("Not found");
  return res.json({ report: row });
}
async function replyReport(req, res) {
  const { text } = req.body || {};
  if (!text) throw ApiError.badRequest("text required");
  const report = await Report.findById(req.params.id);
  if (!report) throw ApiError.notFound("Not found");
  await Report.updateOne(
    { _id: req.params.id },
    {
      $push: {
        replies: { adminId: req.admin._id, text, createdAt: new Date() },
      },
    }
  );
  const owner = resolveReportOwner(report);
  if (owner?.type === "customer") {
    await Notification.create({
      customerId: owner.id,
      type: "report",
      title: "Report reply",
      body: text,
    });
    try {
      await fcm.sendToUser(owner.id, "Report reply", text, {
        reportId: String(report._id),
        type: "report_reply",
      });
    } catch (_) {
      // Best-effort FCM send.
    }
  } else if (owner?.type === "artisan") {
    await Notification.create({
      artisanId: owner.id,
      type: "report",
      title: "Report reply",
      body: text,
    });
    try {
      await fcm.sendToArtisan(owner.id, "Report reply", text, {
        reportId: String(report._id),
        type: "report_reply",
      });
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json({ ok: true });
}
async function closeReport(req, res) {
  const report = await Report.findById(req.params.id);
  if (!report) throw ApiError.notFound("Not found");
  await Report.updateOne(
    { _id: req.params.id },
    { $set: { status: "closed" } }
  );
  const owner = resolveReportOwner(report);
  const title = "Report closed";
  const body = "Your report was closed by admin.";
  if (owner?.type === "customer") {
    await Notification.create({
      customerId: owner.id,
      type: "report",
      title,
      body,
    });
    try {
      await fcm.sendToUser(owner.id, title, body, {
        reportId: String(report._id),
        type: "report_closed",
      });
    } catch (_) {
      // Best-effort FCM send.
    }
  } else if (owner?.type === "artisan") {
    await Notification.create({
      artisanId: owner.id,
      type: "report",
      title,
      body,
    });
    try {
      await fcm.sendToArtisan(owner.id, title, body, {
        reportId: String(report._id),
        type: "report_closed",
      });
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json({ ok: true });
}
async function filterReports(req, res) {
  const { type, status } = req.query;
  const flt = {};
  if (type) flt.type = type;
  if (status) flt.status = status;
  const rows = await Report.find(flt).sort({ createdAt: -1 }).limit(200);
  return res.json({ reports: rows });
}

// Complaints / Support
async function listComplaints(req, res) {
  const { status } = req.query;
  const { page, perPage, skip } = getPagination(req);
  const filter = {};
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    Complaint.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage)
      .populate("customerId", "name email phone")
      .populate("artisanId", "name email phone profession")
      .populate("assignedTo", "name email"),
    Complaint.countDocuments(filter),
  ]);
  const data = items.map((c) => ({
    ...c.toObject(),
    customer: c.customerId,
    artisan: c.artisanId,
    assignedTo: c.assignedTo,
  }));
  return res.json(paginatedResponse(data, total, page, perPage));
}

async function getComplaint(req, res) {
  const item = await Complaint.findById(req.params.id)
    .populate("customerId", "name email phone")
    .populate("artisanId", "name email phone profession")
    .populate("assignedTo", "name email");
  if (!item) throw ApiError.notFound("Complaint not found");
  const payload = {
    ...item.toObject(),
    customer: item.customerId,
    artisan: item.artisanId,
    assignedTo: item.assignedTo,
  };
  return res.json({ complaint: payload, ...dataResponse(payload) });
}

async function updateComplaintStatus(req, res) {
  const { status } = req.body || {};
  const allowed = ["open", "in_review", "assigned", "resolved", "closed"];
  if (!allowed.includes(status || ""))
    throw ApiError.badRequest("Invalid status");
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw ApiError.notFound("Complaint not found");
  await Complaint.updateOne(
    { _id: complaint._id },
    { $set: { status, updatedAt: new Date() } }
  );
  await logActivity(
    req,
    "complaint_status",
    "complaint",
    complaint._id,
    { status: complaint.status },
    { status }
  );
  const owner = resolveComplaintOwner(complaint);
  if (owner?.type === 'customer') {
    await Notification.create({
      customerId: owner.id,
      type: "complaint",
      title: "Complaint status updated",
      body: `Status changed to ${status}`,
    });
    try {
      await fcm.sendToUser(
        owner.id,
        "Complaint status updated",
        `Status changed to ${status}`,
        { complaintId: String(complaint._id), type: "complaint_status", status }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  } else if (owner?.type === 'artisan') {
    await Notification.create({
      artisanId: owner.id,
      type: "complaint",
      title: "Complaint status updated",
      body: `Status changed to ${status}`,
    });
    try {
      await fcm.sendToArtisan(
        owner.id,
        "Complaint status updated",
        `Status changed to ${status}`,
        { complaintId: String(complaint._id), type: "complaint_status", status }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json({ ok: true, ...dataResponse({ status }) });
}

async function assignComplaint(req, res) {
  const { agentId } = req.body || {};
  if (!agentId) throw ApiError.badRequest("agentId required");
  const agent = await Admin.findById(agentId);
  if (!agent) throw ApiError.notFound("Agent not found");
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw ApiError.notFound("Complaint not found");
  await Complaint.updateOne(
    { _id: complaint._id },
    {
      $set: {
        assignedTo: agent._id,
        status: "assigned",
        updatedAt: new Date(),
      },
    }
  );
  await logActivity(
    req,
    "complaint_assigned",
    "complaint",
    complaint._id,
    null,
    { assignedTo: agent._id }
  );
  const owner = resolveComplaintOwner(complaint);
  if (owner?.type === 'customer') {
    await Notification.create({
      customerId: owner.id,
      type: "complaint",
      title: "Complaint assigned",
      body: "Your complaint has been assigned to a support agent.",
    });
    try {
      await fcm.sendToUser(
        owner.id,
        "Complaint assigned",
        "Your complaint has been assigned to a support agent.",
        { complaintId: String(complaint._id), type: "complaint_assigned" }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  } else if (owner?.type === 'artisan') {
    await Notification.create({
      artisanId: owner.id,
      type: "complaint",
      title: "Complaint assigned",
      body: "Your complaint has been assigned to a support agent.",
    });
    try {
      await fcm.sendToArtisan(
        owner.id,
        "Complaint assigned",
        "Your complaint has been assigned to a support agent.",
        { complaintId: String(complaint._id), type: "complaint_assigned" }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json({ ok: true, ...dataResponse({ assignedTo: agent._id }) });
}

async function postComplaintMessage(req, res) {
  const { message, attachments } = req.body || {};
  if (!message) throw ApiError.badRequest("message required");
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw ApiError.notFound("Complaint not found");
  const msg = {
    senderType: "admin",
    senderId: req.admin?._id,
    message,
    attachments: Array.isArray(attachments) ? attachments : [],
  };
  await Complaint.updateOne(
    { _id: complaint._id },
    { $push: { messages: msg }, $set: { updatedAt: new Date() } }
  );
  await logActivity(
    req,
    "complaint_reply",
    "complaint",
    complaint._id,
    null,
    msg
  );
  try {
    const owner = resolveComplaintOwner(complaint);
    if (owner?.type === 'customer') {
      await fcm.sendToUser(
        owner.id,
        "Complaint reply",
        message,
        { complaintId: String(complaint._id), type: "complaint_reply" }
      );
    } else if (owner?.type === 'artisan') {
      await fcm.sendToArtisan(
        owner.id,
        "Complaint reply",
        message,
        { complaintId: String(complaint._id), type: "complaint_reply" }
      );
    }
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.status(201).json(dataResponse(msg));
}

// POST /api/admin/complaints/:id/note
async function addComplaintNote(req, res) {
  const { note, attachments } = req.body || {};
  if (!note) throw ApiError.badRequest("note required");
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw ApiError.notFound("Complaint not found");
  const msg = {
    senderType: "admin",
    senderId: req.admin?._id,
    message: note,
    attachments: Array.isArray(attachments) ? attachments : [],
    createdAt: new Date(),
    kind: "note",
  };
  await Complaint.updateOne(
    { _id: complaint._id },
    { $push: { messages: msg }, $set: { updatedAt: new Date() } }
  );
  await logActivity(
    req,
    "complaint_note",
    "complaint",
    complaint._id,
    null,
    msg
  );
  try {
    const owner = resolveComplaintOwner(complaint);
    if (owner?.type === 'customer') {
      await fcm.sendToUser(
        owner.id,
        "Complaint note",
        note,
        { complaintId: String(complaint._id), type: "complaint_note" }
      );
    } else if (owner?.type === 'artisan') {
      await fcm.sendToArtisan(
        owner.id,
        "Complaint note",
        note,
        { complaintId: String(complaint._id), type: "complaint_note" }
      );
    }
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.status(201).json(dataResponse(msg));
}

// Payments & Wallet
// async function listPayments(req, res) {
//   const rows = await Transaction.find({}).sort({ createdAt: -1 }).limit(200);
//   return res.json({ payments: rows });
// }

async function listPayments(req, res) {
  try {
    const rows = await Transaction.find({})
      .populate("customerId", "name phone email")
      .sort({ createdAt: -1 })
      .limit(200);
    const data = rows.map((tx) => ({
      ...tx.toObject(),
      customer: tx.customerId,
      artisan: tx.artisanId,
    }));
    return res.json({ payments: data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getPayment(req, res) {
  const row = await Transaction.findById(req.params.id);
  if (!row) throw ApiError.notFound("Not found");
  return res.json({ payment: row });
}
async function filterPayments(req, res) {
  const { from, to, user } = req.query;
  const q = {};
  if (user) {
    q.$or = [{ customerId: user }, { artisanId: user }];
  }
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(to);
  }
  const rows = await Transaction.find(q).sort({ createdAt: -1 }).limit(200);
  return res.json({ payments: rows });
}
async function listWithdrawals(req, res) {
  const rows = await Transaction.find({
    type: "withdraw",
    status: "pending",
  }).sort({ createdAt: -1 });
  return res.json(dataResponse({ withdrawals: rows }));
}
async function approveWithdrawal(req, res) {
  const tx = await Transaction.findById(req.params.id);
  if (!tx) throw ApiError.notFound("Withdrawal not found");
  await Transaction.updateOne(
    { _id: tx._id },
    {
      $set: {
        status: "approved",
        approvedAt: new Date(),
        approvedBy: req.admin._id,
      },
    }
  );
  if (tx.artisanId)
    await Notification.create({
      artisanId: tx.artisanId,
      type: "withdraw",
      title: "Withdrawal approved",
      body: `Withdrawal ${tx._id} approved`,
    });
  if (tx.artisanId) {
    try {
      await fcm.sendToArtisan(
        tx.artisanId,
        "Withdrawal approved",
        `Withdrawal ${tx._id} approved`,
        { transactionId: String(tx._id), type: "withdraw_approved" }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json(dataResponse({ ok: true }));
}
async function rejectWithdrawal(req, res) {
  const tx = await Transaction.findById(req.params.id);
  if (!tx) throw ApiError.notFound("Withdrawal not found");
  await Transaction.updateOne(
    { _id: tx._id },
    {
      $set: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: req.admin._id,
      },
    }
  );
  if (tx.artisanId)
    await Notification.create({
      artisanId: tx.artisanId,
      type: "withdraw",
      title: "Withdrawal rejected",
      body: `Withdrawal ${tx._id} rejected`,
    });
  if (tx.artisanId) {
    try {
      await fcm.sendToArtisan(
        tx.artisanId,
        "Withdrawal rejected",
        `Withdrawal ${tx._id} rejected`,
        { transactionId: String(tx._id), type: "withdraw_rejected" }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json(dataResponse({ ok: true }));
}

// Reviews
// async function listReviews(req, res) { const rows = await Review.find({}).sort({ createdAt: -1 }).limit(200); return res.json({ reviews: rows }); }
async function listReviews(req, res) {
  try {
    const rows = await Review.find({})
      .populate("customerId", "name phone")
      .populate("artisanId", "name phone")
      .sort({ createdAt: -1 })
      .limit(200);

    return res.json({ reviews: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function filterReviews(req, res) {
  const { artisan, rating } = req.query;
  const q = {};
  if (artisan) q.artisanId = artisan;
  if (rating) q.rating = Number(rating);
  const rows = await Review.find(q).sort({ createdAt: -1 }).limit(200);
  return res.json({ reviews: rows });
}
async function deleteReview(req, res) {
  await Review.deleteOne({ _id: req.params.id });
  return res.json({ ok: true });
}
async function reviewStats(req, res) {
  const agg = await Review.aggregate([
    {
      $group: {
        _id: "$artisanId",
        avg: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
    { $sort: { avg: -1 } },
  ]);
  return res.json({ stats: agg });
}

// Analytics
async function adminDashboard(req, res) {
  const [customers, artisans, requests, completed, revenue] = await Promise.all(
    [
      Customer.countDocuments({ deleted: { $ne: true } }),
      Artisan.countDocuments({ deleted: { $ne: true } }),
      Request.countDocuments({}),
      Request.countDocuments({ status: "completed" }),
      Transaction.aggregate([
        { $group: { _id: null, total: { $sum: "$debit" } } },
      ]),
    ]
  );
  return res.json({
    customers,
    artisans,
    requests,
    completedRequests: completed,
    totalRevenue: revenue[0]?.total || 0,
  });
}
async function analyticsDaily(req, res) {
  const dailyRequests = await Request.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        total: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const dailySignups = await Customer.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        total: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return res.json({ dailyRequests, dailySignups });
}
async function analyticsRevenue(req, res) {
  const monthly = await Transaction.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
        total: { $sum: "$debit" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return res.json({ monthly });
}
async function analyticsActiveUsers(req, res) {
  const topCustomers = await Request.aggregate([
    { $group: { _id: "$customerId", total: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: 10 },
  ]);
  const topArtisans = await Request.aggregate([
    { $match: { status: "completed" } },
    { $group: { _id: "$artisanId", total: { $sum: 1 } } },
    { $sort: { total: -1 } },
    { $limit: 10 },
  ]);
  return res.json({ topCustomers, topArtisans });
}

async function dashboardStats(req, res) {
  const [customers, artisans, requests, completed, revenue] = await Promise.all(
    [
      Customer.countDocuments({ deleted: { $ne: true } }),
      Artisan.countDocuments({ deleted: { $ne: true } }),
      Request.countDocuments({}),
      Request.countDocuments({ status: "completed" }),
      Transaction.aggregate([
        { $group: { _id: null, total: { $sum: "$debit" } } },
      ]),
    ]
  );
  return res.json(
    dataResponse({
      customers,
      artisans,
      requests,
      completedRequests: completed,
      totalRevenue: revenue[0]?.total || 0,
    })
  );
}

async function dashboardActivity(req, res) {
  const events = await ActivityLog.find({}).sort({ createdAt: -1 }).limit(20);
  return res.json(dataResponse(events));
}

async function dashboardTopArtisans(req, res) {
  const agg = await Review.aggregate([
    {
      $group: {
        _id: "$artisanId",
        avg: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
    { $sort: { avg: -1, count: -1 } },
    { $limit: 5 },
  ]);
  const ids = agg.map((a) => a._id).filter(Boolean);
  const artisans = await Artisan.find({ _id: { $in: ids } }).select(
    "name email profession avatar"
  );
  const map = new Map(artisans.map((a) => [String(a._id), a]));
  const data = agg.map((a) => ({
    artisanId: a._id,
    artisan: map.get(String(a._id)),
    avg: a.avg,
    count: a.count,
  }));
  return res.json(dataResponse(data));
}

// Notifications
async function adminSendNotification(req, res) {
  const { target, title, body } = req.body || {};
  if (!title || !body) throw ApiError.badRequest("title/body required");
  const topicMap = {
    customers: "role_customers",
    artisans: "role_artisans",
    all: "all",
  };
  if (target === "customers" || target === "all") {
    await Notification.create({
      type: "admin_broadcast",
      title,
      body,
      createdAt: new Date(),
    });
  }
  if (target === "artisans" || target === "all") {
    await Notification.create({
      type: "admin_broadcast",
      title,
      body,
      createdAt: new Date(),
    });
  }
  try {
    const topic = topicMap[target] || topicMap.all;
    await fcm.sendToTopic(topic, title, body, { type: "admin_broadcast" });
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.status(201).json({ ok: true });
}
async function adminListNotifications(req, res) {
  const rows = await Notification.find({ type: "admin_broadcast" }).sort({
    createdAt: -1,
  });
  return res.json(dataResponse(rows));
}
async function adminDeleteNotification(req, res) {
  await Notification.deleteOne({ _id: req.params.id });
  return res.json({ ok: true });
}
async function listNotificationTemplates(req, res) {
  const templates = await NotificationTemplate.find({}).sort({ updatedAt: -1 });
  return res.json(dataResponse(templates));
}
async function createNotificationTemplate(req, res) {
  const { name, target, title, message } = req.body || {};
  if (!name || !title || !message)
    throw ApiError.badRequest("name/title/message required");
  const template = await NotificationTemplate.create({
    name,
    target: target || "all",
    title,
    message,
  });
  await logActivity(
    req,
    "notification_template_create",
    "notificationTemplate",
    template._id,
    null,
    template
  );
  return res.status(201).json(dataResponse(template));
}
async function updateNotificationTemplate(req, res) {
  const { name, target, title, message } = req.body || {};
  const template = await NotificationTemplate.findById(req.params.id);
  if (!template) throw ApiError.notFound("Template not found");
  const before = template.toObject();
  if (name !== undefined) template.name = name;
  if (target !== undefined) template.target = target;
  if (title !== undefined) template.title = title;
  if (message !== undefined) template.message = message;
  await template.save();
  await logActivity(
    req,
    "notification_template_update",
    "notificationTemplate",
    template._id,
    before,
    template
  );
  return res.json(dataResponse(template));
}
async function deleteNotificationTemplate(req, res) {
  await NotificationTemplate.deleteOne({ _id: req.params.id });
  await logActivity(
    req,
    "notification_template_delete",
    "notificationTemplate",
    req.params.id
  );
  return res.json({ ok: true });
}

// Settings
async function updateCommission(req, res) {
  const { commission } = req.body || {};
  const doc = await Setting.findOneAndUpdate(
    { key: "global" },
    { $set: { commission, updatedAt: new Date() } },
    { upsert: true, new: true }
  );
  return res.json({ settings: doc, ...dataResponse(doc) });
}
async function updateFeatures(req, res) {
  const features = req.body || {};
  const doc = await Setting.findOneAndUpdate(
    { key: "global" },
    { $set: { features, updatedAt: new Date() } },
    { upsert: true, new: true }
  );
  return res.json({ settings: doc, ...dataResponse(doc) });
}
async function getGeneralSettings(req, res) {
  const defaults = {
    appName: "Usta",
    supportEmail: "support@usta.com",
    about: "",
    logoUrl: "",
  };
  const doc = await Setting.findOneAndUpdate(
    { key: "general" },
    { $setOnInsert: { general: defaults } },
    { upsert: true, new: true }
  );
  return res.json(dataResponse(doc.general || defaults));
}
async function updateGeneralSettings(req, res) {
  const { appName, supportEmail, about, logoUrl } = req.body || {};
  const update = { updatedAt: new Date() };
  if (appName !== undefined) update["general.appName"] = appName;
  if (supportEmail !== undefined) update["general.supportEmail"] = supportEmail;
  if (about !== undefined) update["general.about"] = about;
  if (logoUrl !== undefined) update["general.logoUrl"] = logoUrl;
  const doc = await Setting.findOneAndUpdate(
    { key: "general" },
    { $set: update },
    { upsert: true, new: true }
  );
  await logActivity(
    req,
    "settings_general_update",
    "setting",
    doc._id,
    null,
    doc.general
  );
  return res.json({ settings: doc.general, ...dataResponse(doc.general) });
}
async function getAppOverview(req, res) {
  const doc = await Setting.findOne({ key: "general" });
  const about = doc?.general?.about || "";
  return res.json(dataResponse({ about }));
}
async function updateAppOverview(req, res) {
  const { about } = req.body || {};
  if (about === undefined) throw ApiError.badRequest("about required");
  const doc = await Setting.findOneAndUpdate(
    { key: "general" },
    { $set: { "general.about": about, updatedAt: new Date() } },
    { upsert: true, new: true }
  );
  await logActivity(
    req,
    "settings_about_update",
    "setting",
    doc._id,
    null,
    doc.general
  );
  return res.json({ settings: doc.general, ...dataResponse(doc.general) });
}
async function securitySettings(req, res) {
  return res.json({
    loginRestrictions: false,
    auditEnabled: true,
    lastAdminLogins: [],
  });
}

async function uploadLogo(req, res) {
  const file = req.file;
  if (!file) throw ApiError.badRequest("logo file required");
  const url = `/uploads/${file.filename}`;
  await Setting.findOneAndUpdate(
    { key: "general" },
    { $set: { "general.logoUrl": url, updatedAt: new Date() } },
    { upsert: true }
  );
  return res.status(201).json(dataResponse({ url }));
}

// Marketing
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

// Logs
async function getActivityLogs(req, res) {
  const { page, perPage, skip } = getPagination(req);
  const [items, total] = await Promise.all([
    ActivityLog.find({}).sort({ createdAt: -1 }).skip(skip).limit(perPage),
    ActivityLog.countDocuments({}),
  ]);
  return res.json(paginatedResponse(items, total, page, perPage));
}

async function getSystemHealth(req, res) {
  const uploadsPath = path.join(process.cwd(), "uploads");
  const storage = { uploadsPath, writable: fs.existsSync(uploadsPath) };
  const state = mongoose.connection.readyState;
  const states = { 0: "down", 1: "up", 2: "connecting", 3: "disconnecting" };
  const performance = {
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    load: os.loadavg(),
  };
  return res.json(
    dataResponse({
      apiStatus: "ok",
      storage,
      performance,
      dbStatus: states[state] || "unknown",
      lastCheckedAt: new Date().toISOString(),
    })
  );
}

// Roles & Permissions
async function listRoles(req, res) {
  const roles = await Role.find({}).sort({ createdAt: -1 });
  return res.json(dataResponse(roles));
}
async function getRole(req, res) {
  const role = await Role.findById(req.params.id);
  if (!role) throw ApiError.notFound("Role not found");
  return res.json(dataResponse(role));
}
async function createRole(req, res) {
  const { name, description, permissions } = req.body || {};
  if (!name) throw ApiError.badRequest("name required");
  const role = await Role.create({
    name,
    description,
    permissions: Array.isArray(permissions) ? permissions : [],
  });
  await logActivity(req, "role_create", "role", role._id, null, role);
  return res.status(201).json(dataResponse(role));
}
async function updateRole(req, res) {
  const { name, description, permissions } = req.body || {};
  const role = await Role.findById(req.params.id);
  if (!role) throw ApiError.notFound("Role not found");
  const before = role.toObject();
  if (name !== undefined) role.name = name;
  if (description !== undefined) role.description = description;
  if (permissions !== undefined)
    role.permissions = Array.isArray(permissions) ? permissions : [];
  await role.save();
  await logActivity(req, "role_update", "role", role._id, before, role);
  return res.json(dataResponse(role));
}
async function deleteRole(req, res) {
  await Role.deleteOne({ _id: req.params.id });
  await logActivity(req, "role_delete", "role", req.params.id);
  return res.json({ ok: true });
}

// Orders / Transactions / Wallets
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
        { requestId: String(request._id), type: "status_update", status: normalized }
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
        { requestId: String(request._id), type: "status_update", status: normalized }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return getRequestTimeline(req, res);
}

async function cancelOrder(req, res) {
  const { reason, note } = req.body || {};
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
        { requestId: String(request._id), type: "admin_message", messageId: String(msg._id) }
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
        { requestId: String(request._id), type: "admin_message", messageId: String(msg._id) }
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
    await Notification.create({
      artisanId: trx.artisanId,
      type: "payout",
      title,
      body,
    });
    try {
      await fcm.sendToArtisan(trx.artisanId, title, body, {
        transactionId: String(trx._id),
        type: "payout_status",
        status,
      });
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  if (trx.customerId) {
    await Notification.create({
      customerId: trx.customerId,
      type: "payment",
      title,
      body,
    });
    try {
      await fcm.sendToUser(trx.customerId, title, body, {
        transactionId: String(trx._id),
        type: "payout_status",
        status,
      });
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json(dataResponse({ status }));
}

// AI & Automation (simple placeholders)
async function aiReviewsAnalysis(req, res) {
  const rows = await Review.find({}).sort({ createdAt: -1 }).limit(500);
  const posWords = ["great", "good", "excellent", "perfect", "amazing"];
  const negWords = ["bad", "poor", "terrible", "awful", "worst"];
  let pos = 0,
    neg = 0,
    neutral = 0;
  for (const r of rows) {
    const c = (r.comment || "").toLowerCase();
    const hasPos = posWords.some((w) => c.includes(w));
    const hasNeg = negWords.some((w) => c.includes(w));
    if (hasPos && !hasNeg) pos++;
    else if (hasNeg && !hasPos) neg++;
    else neutral++;
  }
  return res.json({
    total: rows.length,
    positive: pos,
    negative: neg,
    neutral,
  });
}
// async function aiTopArtisans(req, res) {
//   const agg = await Review.aggregate([{ $group: { _id: '$artisanId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }, { $sort: { avg: -1, count: -1 } }, { $limit: 10 }]);
//   return res.json({ top: agg });
// }

async function aiTopArtisans(req, res) {
  try {
    const agg = await Review.aggregate([
      {
        $group: {
          _id: "$artisanId",
          avg: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
      { $sort: { avg: -1, count: -1 } },
      { $limit: 10 },
    ]);
    const ids = agg.map((a) => a._id).filter(Boolean);
    const artisans = await Artisan.find({ _id: { $in: ids } }).select(
      "name email phone profession avatar"
    );
    const map = new Map(artisans.map((a) => [String(a._id), a]));
    const result = agg.map((a) => ({
      artisanId: a._id,
      artisan: map.get(String(a._id)) || null,
      avg: a.avg,
      count: a.count,
    }));

    return res.json({ top: result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function aiFraudDetection(req, res) {
  const cancelAgg = await Request.aggregate([
    {
      $group: {
        _id: "$customerId",
        cancelled: {
          $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
        },
        total: { $sum: 1 },
      },
    },
    {
      $project: {
        rate: {
          $cond: [
            { $eq: ["$total", 0] },
            0,
            { $divide: ["$cancelled", "$total"] },
          ],
        },
      },
    },
    { $match: { rate: { $gt: 0.5 } } },
    { $sort: { rate: -1 } },
  ]);
  return res.json({ suspiciousCustomers: cancelAgg });
}

async function aiWordCloud(req, res) {
  const reviews = await Review.find({}).select("comment").limit(1000);
  const complaints = await Complaint.find({})
    .select("issue messages")
    .limit(300);
  const texts = [];
  reviews.forEach((r) => texts.push(r.comment || ""));
  complaints.forEach((c) => {
    texts.push(c.issue || "");
    (c.messages || []).forEach((m) => texts.push(m.message || ""));
  });
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "هذا",
    "هذه",
    "كان",
    "على",
    "من",
    "في",
    "الى",
    "your",
    "you",
    "are",
    "but",
    "not",
    "عن",
    "الى",
    "الي",
    "was",
    "were",
  ]);
  const counts = {};
  for (const text of texts) {
    const words = (text || "")
      .toLowerCase()
      .replace(/[^a-z\u0600-\u06FF\s]/g, " ")
      .split(/\s+/);
    for (const w of words) {
      if (!w || w.length < 3) continue;
      if (stop.has(w)) continue;
      counts[w] = (counts[w] || 0) + 1;
    }
  }
  const cloud = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([word, count]) => ({ word, count }));
  return res.json(dataResponse(cloud));
}

// Auth helpers
async function refreshAdminToken(req, res) {
  const token = signAdmin(req.admin);
  return res.json(dataResponse({ token }));
}

async function adminMe(req, res) {
  return res.json(
    dataResponse({
      _id: req.admin._id,
      name: req.admin.name,
      email: req.admin.email,
      role: req.admin.role,
    })
  );
}

module.exports = {
  adminLogin,
  adminCreate,
  adminChangePassword,
  adminLogout,
  adminVerifyRole,
  refreshAdminToken,
  adminMe,
  listCustomers,
  getCustomer,
  blockCustomer,
  deleteCustomer,
  searchCustomers,
  listArtisans,
  getArtisan,
  approveArtisan,
  rejectArtisan,
  updateArtisanStatus,
  filterArtisans,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listRequests,
  getRequest,
  filterRequests,
  expireStaleRequests,
  autoConfirmRequests,
  deleteRequest,
  updateRequestStatus,
  getRequestTimeline,
  closeOrCancelRequest,
  listReports,
  getReport,
  replyReport,
  closeReport,
  filterReports,
  listComplaints,
  getComplaint,
  updateComplaintStatus,
  assignComplaint,
  postComplaintMessage,
  addComplaintNote,
  listPayments,
  getPayment,
  filterPayments,
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  listReviews,
  filterReviews,
  deleteReview,
  reviewStats,
  adminDashboard,
  analyticsDaily,
  analyticsRevenue,
  analyticsActiveUsers,
  dashboardStats,
  dashboardActivity,
  dashboardTopArtisans,
  adminSendNotification,
  adminListNotifications,
  adminDeleteNotification,
  listNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  updateCommission,
  updateFeatures,
  getGeneralSettings,
  updateGeneralSettings,
  getAppOverview,
  updateAppOverview,
  securitySettings,
  uploadLogo,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  marketingReferralStats,
  marketingRewards,
  getActivityLogs,
  getSystemHealth,
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
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
  aiReviewsAnalysis,
  aiTopArtisans,
  aiFraudDetection,
  aiWordCloud,
  blockCustomerBody,
  approveArtisanBody,
  rejectArtisanBody,
};
