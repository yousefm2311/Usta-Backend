const { ApiError } = require("../../errors/apiError");
const { assertObjectId } = require("../../utils/shared/objectId");
const { notifyUser } = require("../../utils/shared/notify");
const Report = require("../../models/report.model");

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

async function listReports(req, res) {
  const rows = await Report.find({}).sort({ createdAt: -1 }).limit(200);
  return res.json({ reports: rows });
}

async function getReport(req, res) {
  assertObjectId(req.params.id, "reportId");
  const row = await Report.findById(req.params.id);
  if (!row) throw ApiError.notFound("Not found");
  return res.json({ report: row });
}

async function replyReport(req, res) {
  const { text } = req.body || {};
  if (!text) throw ApiError.badRequest("text required");
  assertObjectId(req.params.id, "reportId");
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
    await notifyUser({
      customerId: owner.id,
      type: "report",
      title: "Report reply",
      body: text,
      data: { reportId: String(report._id), type: "report_reply" },
    });
  } else if (owner?.type === "artisan") {
    await notifyUser({
      artisanId: owner.id,
      type: "report",
      title: "Report reply",
      body: text,
      data: { reportId: String(report._id), type: "report_reply" },
    });
  }
  return res.json({ ok: true });
}

async function closeReport(req, res) {
  assertObjectId(req.params.id, "reportId");
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
    await notifyUser({
      customerId: owner.id,
      type: "report",
      title,
      body,
      data: { reportId: String(report._id), type: "report_closed" },
    });
  } else if (owner?.type === "artisan") {
    await notifyUser({
      artisanId: owner.id,
      type: "report",
      title,
      body,
      data: { reportId: String(report._id), type: "report_closed" },
    });
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

module.exports = {
  listReports,
  getReport,
  replyReport,
  closeReport,
  filterReports,
};

