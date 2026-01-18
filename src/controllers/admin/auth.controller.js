const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ApiError } = require("../../errors/apiError");
const { dataResponse } = require("../../utils/shared/responder");
const Admin = require("../../models/admin.model");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(500, "JWT secret not configured");
    }
    return "dev-secret";
  }
  return secret;
}

function signAdmin(admin) {
  const secret = getJwtSecret();
  const tokenVersion = admin.tokenVersion || 0;
  return jwt.sign(
    { sub: String(admin._id), role: admin.role, kind: "admin", tokenVersion },
    secret,
    { expiresIn: "8h" }
  );
}

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
  return res.status(201).json({
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
};

