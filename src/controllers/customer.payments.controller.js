const { ApiError } = require('../errors/apiError');
const Transaction = require('../models/transaction.model');
const Request = require('../models/request.model');

async function createPayment(req, res) {
  const { requestId, amount, method } = req.body || {};
  const amt = Number(amount || 0);
  if (!requestId || !(amt > 0)) throw ApiError.badRequest('Invalid data');
  const reqDoc = await Request.findOne({ _id: requestId, customerId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');
  const tx = await Transaction.create({ customerId: req.user._id, credit: 0, debit: amt, type: 'payment', method: method || 'cash', requestId: reqDoc._id, status: 'paid' });
  return res.status(201).json({ paymentId: tx._id, receipt: tx });
}

async function getReceipt(req, res) {
  const { id } = req.params; const tx = await Transaction.findOne({ _id: id, customerId: req.user._id });
  if (!tx) throw ApiError.notFound('Receipt not found');
  return res.json({ receipt: tx });
}

async function wallet(req, res) {
  const agg = await Transaction.aggregate([
    { $match: { customerId: req.user._id } },
    { $group: { _id: null, balance: { $sum: { $subtract: ['$credit', '$debit'] } } } },
  ]);
  const balance = agg[0]?.balance || 0;
  return res.json({ balance });
}

async function recharge(req, res) {
  const amt = Number(req.body.amount || 0);
  if (!(amt > 0)) throw ApiError.badRequest('Invalid amount');
  await Transaction.create({ customerId: req.user._id, credit: amt, debit: 0, type: 'recharge', method: req.body.method || 'card', status: 'done' });
  return res.status(201).json({ ok: true });
}

async function history(req, res) {
  const rows = await Transaction.find({ customerId: req.user._id }).sort({ createdAt: -1 }).limit(200);
  return res.json({ transactions: rows });
}

module.exports = { createPayment, getReceipt, wallet, recharge, history };

