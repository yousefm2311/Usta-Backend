const { ApiError } = require("../../errors/apiError");
const { dataResponse } = require("../../utils/shared/responder");
const { assertObjectId } = require("../../utils/shared/objectId");
const { notifyUser } = require("../../utils/shared/notify");
const Customer = require("../../models/customer.model");

async function listCustomers(req, res) {
  const rows = await Customer.find({})
    .select("-password")
    .limit(200)
    .sort({ createdAt: -1 });
  return res.json({ customers: rows });
}

async function getCustomer(req, res) {
  assertObjectId(req.params.id, "customerId");
  const row = await Customer.findById(req.params.id).select("-password");
  if (!row) throw ApiError.notFound("Not found");
  return res.json({ customer: row });
}

async function blockCustomer(req, res) {
  const { id } = req.params;
  assertObjectId(id, "customerId");
  const { blocked } = req.body || {};
  await Customer.updateOne({ _id: id }, { $set: { blocked: !!blocked } });
  const title = blocked ? "Account blocked" : "Account unblocked";
  const body = blocked
    ? "Your account has been blocked by admin."
    : "Your account has been unblocked by admin.";
  await notifyUser({
    customerId: id,
    type: "account",
    title,
    body,
    data: { type: "account_status", blocked: !!blocked },
  });
  return res.json({ ok: true });
}

async function deleteCustomer(req, res) {
  const { id } = req.params;
  assertObjectId(id, "customerId");
  await Customer.updateOne({ _id: id }, { $set: { deleted: true } });
  const title = "Account deleted";
  const body = "Your account has been deleted by admin.";
  await notifyUser({
    customerId: id,
    type: "account",
    title,
    body,
    data: { type: "account_deleted" },
  });
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
  assertObjectId(customerId, "customerId");
  await Customer.updateOne(
    { _id: customerId },
    { $set: { blocked: blocked === undefined ? true : !!blocked } }
  );
  const isBlocked = blocked === undefined ? true : !!blocked;
  const title = isBlocked ? "Account blocked" : "Account unblocked";
  const body = isBlocked
    ? "Your account has been blocked by admin."
    : "Your account has been unblocked by admin.";
  await notifyUser({
    customerId,
    type: "account",
    title,
    body,
    data: { type: "account_status", blocked: isBlocked },
  });
  return res.json(
    dataResponse({
      customerId,
      blocked: blocked === undefined ? true : !!blocked,
    })
  );
}

module.exports = {
  listCustomers,
  getCustomer,
  blockCustomer,
  deleteCustomer,
  searchCustomers,
  blockCustomerBody,
};

