const { ApiError } = require("../../errors/apiError");
const { dataResponse, paginatedResponse } = require("../../utils/shared/responder");
const { getPagination } = require("../../utils/shared/pagination");
const { assertObjectId } = require("../../utils/shared/objectId");
const { notifyUser } = require("../../utils/shared/notify");
const Complaint = require("../../models/complaint.model");
const Admin = require("../../models/admin.model");
const ActivityLog = require("../../models/activityLog.model");
const fcm = require("../../services/shared/fcm.service");

function resolveComplaintOwner(complaint) {
  if (complaint?.createdByType && complaint?.createdById) {
    return { type: complaint.createdByType, id: complaint.createdById };
  }
  if (complaint?.customerId && !complaint?.artisanId) {
    return { type: "customer", id: complaint.customerId };
  }
  if (complaint?.artisanId && !complaint?.customerId) {
    return { type: "artisan", id: complaint.artisanId };
  }
  const firstMsg = Array.isArray(complaint?.messages)
    ? complaint.messages[0]
    : null;
  if (firstMsg?.senderType === "customer") {
    return { type: "customer", id: complaint.customerId };
  }
  if (firstMsg?.senderType === "artisan") {
    return { type: "artisan", id: complaint.artisanId };
  }
  if (complaint?.customerId) return { type: "customer", id: complaint.customerId };
  if (complaint?.artisanId) return { type: "artisan", id: complaint.artisanId };
  return null;
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
  assertObjectId(req.params.id, "complaintId");
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
  assertObjectId(req.params.id, "complaintId");
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
  if (owner?.type === "customer") {
    await notifyUser({
      customerId: owner.id,
      type: "complaint",
      title: "Complaint status updated",
      body: `Status changed to ${status}`,
      data: {
        complaintId: String(complaint._id),
        type: "complaint_status",
        status,
      },
    });
  } else if (owner?.type === "artisan") {
    await notifyUser({
      artisanId: owner.id,
      type: "complaint",
      title: "Complaint status updated",
      body: `Status changed to ${status}`,
      data: {
        complaintId: String(complaint._id),
        type: "complaint_status",
        status,
      },
    });
  }
  return res.json({ ok: true, ...dataResponse({ status }) });
}

async function assignComplaint(req, res) {
  const { agentId } = req.body || {};
  if (!agentId) throw ApiError.badRequest("agentId required");
  assertObjectId(req.params.id, "complaintId");
  assertObjectId(agentId, "agentId");
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
  if (owner?.type === "customer") {
    await notifyUser({
      customerId: owner.id,
      type: "complaint",
      title: "Complaint assigned",
      body: "Your complaint has been assigned to a support agent.",
      data: {
        complaintId: String(complaint._id),
        type: "complaint_assigned",
      },
    });
  } else if (owner?.type === "artisan") {
    await notifyUser({
      artisanId: owner.id,
      type: "complaint",
      title: "Complaint assigned",
      body: "Your complaint has been assigned to a support agent.",
      data: {
        complaintId: String(complaint._id),
        type: "complaint_assigned",
      },
    });
  }
  return res.json({ ok: true, ...dataResponse({ assignedTo: agent._id }) });
}

async function postComplaintMessage(req, res) {
  const { message, attachments } = req.body || {};
  if (!message) throw ApiError.badRequest("message required");
  assertObjectId(req.params.id, "complaintId");
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
  await logActivity(req, "complaint_reply", "complaint", complaint._id, null, msg);
  try {
    const owner = resolveComplaintOwner(complaint);
    if (owner?.type === "customer") {
      await fcm.sendToUser(owner.id, "Complaint reply", message, {
        complaintId: String(complaint._id),
        type: "complaint_reply",
      });
    } else if (owner?.type === "artisan") {
      await fcm.sendToArtisan(owner.id, "Complaint reply", message, {
        complaintId: String(complaint._id),
        type: "complaint_reply",
      });
    }
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.status(201).json(dataResponse(msg));
}

async function addComplaintNote(req, res) {
  const { note, attachments } = req.body || {};
  if (!note) throw ApiError.badRequest("note required");
  assertObjectId(req.params.id, "complaintId");
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
  await logActivity(req, "complaint_note", "complaint", complaint._id, null, msg);
  try {
    const owner = resolveComplaintOwner(complaint);
    if (owner?.type === "customer") {
      await fcm.sendToUser(owner.id, "Complaint note", note, {
        complaintId: String(complaint._id),
        type: "complaint_note",
      });
    } else if (owner?.type === "artisan") {
      await fcm.sendToArtisan(owner.id, "Complaint note", note, {
        complaintId: String(complaint._id),
        type: "complaint_note",
      });
    }
  } catch (_) {
    // Best-effort FCM send.
  }
  return res.status(201).json(dataResponse(msg));
}

module.exports = {
  listComplaints,
  getComplaint,
  updateComplaintStatus,
  assignComplaint,
  postComplaintMessage,
  addComplaintNote,
};


