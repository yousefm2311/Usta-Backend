const { ApiError } = require("../../errors/apiError");
const { dataResponse } = require("../../utils/shared/responder");
const Setting = require("../../models/settings.model");
const ActivityLog = require("../../models/activityLog.model");
const fs = require("fs");
const path = require("path");

const LOGO_MAX_DIM = 1200;
const LOGO_QUALITY = 72;

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

async function optimizeLogoImage(file) {
  const inputPath = file.path;
  const ext = path.extname(file.filename || "");
  const base = path.basename(file.filename || "", ext);
  const outName = `${base}.webp`;
  const outPath = path.join(path.dirname(inputPath), outName);
  try {
    const sharp = require("sharp");
    await sharp(inputPath)
      .rotate()
      .resize({ width: LOGO_MAX_DIM, height: LOGO_MAX_DIM, fit: "inside", withoutEnlargement: true })
      .toFormat("webp", { quality: LOGO_QUALITY })
      .toFile(outPath);
    fs.unlinkSync(inputPath);
    return outName;
  } catch (_) {
    return file.filename;
  }
}

async function uploadLogo(req, res) {
  const file = req.file;
  if (!file) throw ApiError.badRequest("logo file required");
  const filename = await optimizeLogoImage(file);
  const url = `/uploads/${filename}`;
  await Setting.findOneAndUpdate(
    { key: "general" },
    { $set: { "general.logoUrl": url, updatedAt: new Date() } },
    { upsert: true }
  );
  return res.status(201).json(dataResponse({ url }));
}

module.exports = {
  updateCommission,
  updateFeatures,
  getGeneralSettings,
  updateGeneralSettings,
  getAppOverview,
  updateAppOverview,
  securitySettings,
  uploadLogo,
};

