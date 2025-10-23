const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const reportSchema = new mongoose.Schema({
  type: { type: String, enum: ['customer', 'artisan', 'system'], default: 'customer' },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  title: { type: String },
  body: { type: String },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan' },
  replies: [replySchema],
  createdAt: { type: Date, default: Date.now },
});

reportSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('Report', reportSchema);

