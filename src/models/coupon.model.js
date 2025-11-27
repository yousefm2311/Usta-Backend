const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  discount: { type: Number, required: true }, // legacy support
  type: { type: String, enum: ['percent', 'fixed'], default: 'percent' }, // legacy support
  discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  value: { type: Number, default() { return this.discount; } },
  minOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  expiresAt: { type: Date },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

module.exports = mongoose.model('Coupon', couponSchema);
