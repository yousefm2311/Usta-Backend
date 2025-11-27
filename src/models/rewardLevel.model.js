const mongoose = require('mongoose');

const rewardLevelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  threshold: { type: Number, default: 0 },
  benefits: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

rewardLevelSchema.index({ threshold: 1 });

module.exports = mongoose.model('RewardLevel', rewardLevelSchema);
