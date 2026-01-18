const { ApiError } = require("../../errors/apiError");
const { dataResponse } = require("../../utils/shared/responder");
const { assertObjectId } = require("../../utils/shared/objectId");
const { notifyUser } = require("../../utils/shared/notify");
const Transaction = require("../../models/transaction.model");

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
  assertObjectId(req.params.id, "paymentId");
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
  assertObjectId(req.params.id, "withdrawalId");
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
  if (tx.artisanId) {
    await notifyUser({
      artisanId: tx.artisanId,
      type: "withdraw",
      title: "Withdrawal approved",
      body: `Withdrawal ${tx._id} approved`,
      data: { transactionId: String(tx._id), type: "withdraw_approved" },
    });
  }
  return res.json(dataResponse({ ok: true }));
}

async function rejectWithdrawal(req, res) {
  assertObjectId(req.params.id, "withdrawalId");
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
  if (tx.artisanId) {
    await notifyUser({
      artisanId: tx.artisanId,
      type: "withdraw",
      title: "Withdrawal rejected",
      body: `Withdrawal ${tx._id} rejected`,
      data: { transactionId: String(tx._id), type: "withdraw_rejected" },
    });
  }
  return res.json(dataResponse({ ok: true }));
}

module.exports = {
  listPayments,
  getPayment,
  filterPayments,
  listWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
};

