const { ApiError } = require("../../errors/apiError");
const { dataResponse } = require("../../utils/shared/responder");
const { assertObjectId } = require("../../utils/shared/objectId");
const Role = require("../../models/role.model");
const ActivityLog = require("../../models/activityLog.model");

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

async function listRoles(req, res) {
  const roles = await Role.find({}).sort({ createdAt: -1 });
  return res.json(dataResponse(roles));
}

async function getRole(req, res) {
  assertObjectId(req.params.id, "roleId");
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
  assertObjectId(req.params.id, "roleId");
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
  assertObjectId(req.params.id, "roleId");
  await Role.deleteOne({ _id: req.params.id });
  await logActivity(req, "role_delete", "role", req.params.id);
  return res.json({ ok: true });
}

module.exports = {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
};

