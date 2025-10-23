const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  discount: { type: Number, required: true },
  type: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  active: { type: Boolean, default: true },
  expiresAt: { type: Date },
});

couponSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('Coupon', couponSchema);

