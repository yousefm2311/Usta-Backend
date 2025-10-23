const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  code: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

referralSchema.index({ customerId: 1, createdAt: 1 });

module.exports = mongoose.model('Referral', referralSchema);

