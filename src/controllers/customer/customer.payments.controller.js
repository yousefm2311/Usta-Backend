const { ApiError } = require('../../errors/apiError');
const Transaction = require('../../models/transaction.model');
const Request = require('../../models/request.model');
const Coupon = require('../../models/coupon.model');
const CouponUse = require('../../models/couponUse.model');
const { dataResponse } = require('../../utils/shared/responder');

function formatReceipt(tx) {
  if (!tx) return null;
  const currency = process.env.CURRENCY || 'EGP';
  const credit = Number(tx.credit || 0);
  const debit = Number(tx.debit || 0);
  const amount = typeof tx.finalAmount === 'number' ? Number(tx.finalAmount) : +(credit - debit);
  return {
    _id: tx._id,
    requestId: tx.requestId || null,
    customerId: tx.customerId || null,
    transactionId: tx.transactionId || null,
    credit,
    debit,
    amount,
    currency,
    type: tx.type,
    method: tx.method || 'cash',
    status: tx.status || 'pending',
    createdAt: tx.createdAt,
    meta: {
      note: tx.note || null,
      fees: Number(tx.fees || 0),
      vat: Number(tx.vat || 0),
    },
  };
}

function normalizeCoupon(c) {
  if (!c) return null;
  return {
    code: c.code,
    discountType: c.discountType || c.type || 'percent',
    value: typeof c.value === 'number' ? c.value : c.discount,
    minOrder: c.minOrder || 0,
    expiresAt: c.expiresAt,
    active: c.active,
  };
}

async function applyCouponIfAny({ code, amount, customerId }) {
  if (!code) return { coupon: null, discountAmount: 0, finalAmount: amount };
  const couponCode = String(code || '').trim().toUpperCase();
  if (!couponCode) throw ApiError.badRequest('code required');
  const c = await Coupon.findOne({ code: couponCode, active: true });
  if (!c) throw ApiError.notFound('Invalid coupon');
  if (c.expiresAt && c.expiresAt < new Date()) throw ApiError.badRequest('Coupon expired');
  if (amount < (c.minOrder || 0)) throw ApiError.badRequest('Order amount below minimum');
  const used = await CouponUse.findOne({ couponId: c._id, customerId });
  if (used) throw ApiError.conflict('Coupon already used by this customer');

  let discountAmount = 0;
  if ((c.discountType || c.type) === 'fixed') {
    discountAmount = Math.min(c.value || c.discount || 0, amount);
  } else {
    const pct = c.value || c.discount || 0;
    discountAmount = +(amount * (pct / 100)).toFixed(2);
  }
  const finalAmount = +(amount - discountAmount).toFixed(2);
  await CouponUse.create({ couponId: c._id, customerId, code: couponCode });
  return { coupon: normalizeCoupon(c), discountAmount, finalAmount, couponCode };
}

async function createPayment(req, res) {
  const { requestId, amount, method, couponCode } = req.body || {};
  const amt = Number(amount || 0);
  if (!requestId || !(amt > 0)) throw ApiError.badRequest('Invalid data');
  const reqDoc = await Request.findOne({ _id: requestId, customerId: req.user._id });
  if (!reqDoc) throw ApiError.notFound('Request not found');

  const { coupon, discountAmount = 0, finalAmount = amt, couponCode: normalizedCode } = await applyCouponIfAny({ code: couponCode, amount: amt, customerId: req.user._id });

  const tx = await Transaction.create({
    customerId: req.user._id,
    credit: 0,
    debit: finalAmount,
    type: 'payment',
    method: method || 'cash',
    requestId: reqDoc._id,
    status: 'paid',
    couponCode: normalizedCode,
    couponDiscount: discountAmount,
    finalAmount,
  });

  await Request.updateOne(
    { _id: reqDoc._id },
    {
      $set: {
        paidAmount: finalAmount,
        couponCode: normalizedCode,
        couponDiscount: discountAmount,
        status: reqDoc.status === 'accepted' ? 'in_progress' : reqDoc.status,
        updatedAt: new Date(),
      },
    },
  );

  return res.status(201).json(
    dataResponse({
      paymentId: tx._id,
      receipt: formatReceipt(tx),
      coupon,
      discountAmount,
      finalAmount,
      originalAmount: amt,
    }),
  );
}

async function getReceipt(req, res) {
  const { id } = req.params; const tx = await Transaction.findOne({ _id: id, customerId: req.user._id });
  if (!tx) throw ApiError.notFound('Receipt not found');
  return res.json(dataResponse({ receipt: formatReceipt(tx) }));
}

async function wallet(req, res) {
  const agg = await Transaction.aggregate([
    { $match: { customerId: req.user._id } },
    { $group: { _id: null, balance: { $sum: { $subtract: ['$credit', '$debit'] } } } },
  ]);
  const balance = agg[0]?.balance || 0;
  return res.json(dataResponse({ balance }));
}

async function recharge(req, res) {
  const amt = Number(req.body.amount || 0);
  if (!(amt > 0)) throw ApiError.badRequest('Invalid amount');
  await Transaction.create({ customerId: req.user._id, credit: amt, debit: 0, type: 'recharge', method: req.body.method || 'card', status: 'done' });
  return res.status(201).json(dataResponse({ ok: true }));
}

async function history(req, res) {
  const rows = await Transaction.find({ customerId: req.user._id }).sort({ createdAt: -1 }).limit(200);
  return res.json(dataResponse({ transactions: rows }));
}

module.exports = { createPayment, getReceipt, wallet, recharge, history };


