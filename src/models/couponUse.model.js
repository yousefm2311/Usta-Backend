const mongoose = require('mongoose');

const couponUseSchema = new mongoose.Schema({
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  code: { type: String, required: true },
  usedAt: { type: Date, default: Date.now },
});

couponUseSchema.index({ couponId: 1, customerId: 1 });

module.exports = mongoose.model('CouponUse', couponUseSchema);

