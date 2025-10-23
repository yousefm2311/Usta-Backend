const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  sender: { type: String, enum: ['artisan', 'customer'], required: true },
  type: { type: String, enum: ['text', 'image', 'audio'], required: true },
  text: { type: String },
  mediaPath: { type: String },
  mediaMime: { type: String },
  readBy: { artisan: { type: Boolean, default: false }, customer: { type: Boolean, default: false } },
  createdAt: { type: Date, default: Date.now },
});

messageSchema.index({ requestId: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);

