const { ApiError } = require("../../errors/apiError");
const { dataResponse } = require("../../utils/shared/responder");
const { assertObjectId } = require("../../utils/shared/objectId");
const { notifyUser } = require("../../utils/shared/notify");
const Request = require("../../models/request.model");
const RequestTimeline = require("../../models/requestTimeline.model");
const ActivityLog = require("../../models/activityLog.model");
const requestService = require("../../services/requests/request.service");
const fcm = require("../../services/shared/fcm.service");

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

async function listRequests(req, res) {
  try {
    const rows = await Request.find({})
      .populate("customerId", "name phone email")
      .populate("artisanId", "name phone email profession")
      .sort({ createdAt: -1 })
      .limit(200);

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
  assertObjectId(req.params.id, "requestId");
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
    if (Number.isNaN(parsedBefore.getTime()))
      throw ApiError.badRequest("Invalid before date");
  }
  const docs = await requestService.expireStaleRequests({
    now: parsedBefore || undefined,
    limit: limit ? Number(limit) : undefined,
  });
  return res.json(
    dataResponse({
      expiredCount: docs.length,
      requestIds: docs.map((r) => r._id),
    })
  );
}

async function autoConfirmRequests(req, res) {
  const { limit, before } = req.body || {};
  let parsedBefore;
  if (before !== undefined) {
    parsedBefore = new Date(before);
    if (Number.isNaN(parsedBefore.getTime()))
      throw ApiError.badRequest("Invalid before date");
  }
  const docs = await requestService.autoConfirmAwaitingCompletion({
    now: parsedBefore || undefined,
    limit: limit ? Number(limit) : undefined,
  });
  return res.json(
    dataResponse({
      confirmedCount: docs.length,
      requestIds: docs.map((r) => r._id),
    })
  );
}

async function deleteRequest(req, res) {
  assertObjectId(req.params.id, "requestId");
  const existing = await Request.findById(req.params.id).select(
    "customerId artisanId serviceType"
  );
  await Request.deleteOne({ _id: req.params.id });
  if (existing?.customerId) {
    const title = "Request removed";
    const body = existing.serviceType
      ? `Your request for ${existing.serviceType} was removed by admin.`
      : "Your request was removed by admin.";
    await notifyUser({
      customerId: existing.customerId,
      type: "request",
      title,
      body,
      data: { requestId: String(req.params.id), type: "request_removed" },
    });
  }
  if (existing?.artisanId) {
    const title = "Request removed";
    const body = existing.serviceType
      ? `A request for ${existing.serviceType} was removed by admin.`
      : "A request was removed by admin.";
    await notifyUser({
      artisanId: existing.artisanId,
      type: "request",
      title,
      body,
      data: { requestId: String(req.params.id), type: "request_removed" },
    });
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
  assertObjectId(req.params.id, "requestId");
  if (req.body?.artisanId) assertObjectId(req.body.artisanId, "artisanId");
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
    const title = "New request assigned";
    const body = `A request was assigned to you${
      existing.serviceType ? `: ${existing.serviceType}` : ""
    }.`;
    await notifyUser({
      artisanId: req.body.artisanId,
      type: "request",
      title,
      body,
      data: { requestId: String(existing._id), type: "assigned" },
    });
  }
  if (existing.customerId) {
    await notifyUser({
      customerId: existing.customerId,
      type: "request",
      title: "Request status updated",
      body: `Status changed to ${normalized}`,
      data: {
        requestId: String(existing._id),
        type: "status_update",
        status: normalized,
      },
    });
  }
  const artisanId = req.body.artisanId || existing.artisanId;
  if (artisanId) {
    try {
      await fcm.sendToArtisan(
        artisanId,
        "Request status updated",
        `Status changed to ${normalized}`,
        {
          requestId: String(existing._id),
          type: "status_update",
          status: normalized,
        }
      );
    } catch (_) {
      // Best-effort FCM send.
    }
  }
  return res.json({ ok: true, ...dataResponse({ status: normalized }) });
}

async function getRequestTimeline(req, res) {
  assertObjectId(req.params.id, "requestId");
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
  assertObjectId(req.params.id, "requestId");
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
  return res.json({ ok: true, ...dataResponse({ status: normalized }) });
}

module.exports = {
  listRequests,
  getRequest,
  filterRequests,
  expireStaleRequests,
  autoConfirmRequests,
  deleteRequest,
  updateRequestStatus,
  getRequestTimeline,
  closeOrCancelRequest,
};


