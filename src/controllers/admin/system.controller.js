const fs = require("fs");
const path = require("path");
const os = require("os");
const mongoose = require("mongoose");
const { ApiError } = require("../../errors/apiError");
const { dataResponse, paginatedResponse } = require("../../utils/shared/responder");
const { getPagination } = require("../../utils/shared/pagination");
const ActivityLog = require("../../models/activityLog.model");
const Notification = require("../../models/notification.model");
const NotificationTemplate = require("../../models/notificationTemplate.model");
const fcm = require("../../services/shared/fcm.service");

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

module.exports = {
  adminSendNotification,
  adminListNotifications,
  adminDeleteNotification,
  listNotificationTemplates,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  getActivityLogs,
  getSystemHealth,
};


