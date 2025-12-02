const mongoose = require('mongoose');

const directMessageSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan', required: true },
  sender: { type: String, enum: ['customer', 'artisan'], required: true },
  text: { type: String },
  attachments: [{ type: String }],
  readBy: {
    customer: { type: Boolean, default: false },
    artisan: { type: Boolean, default: false },
  },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

directMessageSchema.index({ customerId: 1, artisanId: 1, createdAt: 1 });

module.exports = mongoose.model('DirectMessage', directMessageSchema);
