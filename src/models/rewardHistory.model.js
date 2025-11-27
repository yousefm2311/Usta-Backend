const mongoose = require('mongoose');

const rewardHistorySchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  points: { type: Number, default: 0 },
  type: { type: String, enum: ['earn', 'redeem'], default: 'earn' },
  note: { type: String },
  createdAt: { type: Date, default: Date.now },
});

rewardHistorySchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model('RewardHistory', rewardHistorySchema);
