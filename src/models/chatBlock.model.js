const mongoose = require('mongoose');

const chatBlockSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan', required: true },
  blockedBy: { type: String, enum: ['customer', 'artisan'], required: true },
  reason: { type: String },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

chatBlockSchema.index({ customerId: 1, artisanId: 1 }, { unique: true });

module.exports = mongoose.model('ChatBlock', chatBlockSchema);
