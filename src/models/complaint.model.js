const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderType: { type: String, enum: ['customer', 'artisan', 'admin'], required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId },
  message: { type: String, required: true },
  attachments: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const complaintSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan' },
  createdByType: { type: String, enum: ['customer', 'artisan'] },
  createdById: { type: mongoose.Schema.Types.ObjectId },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
  issue: { type: String, required: true },
  type: { type: String }, // e.g. 'service', 'payment', 'behavior'
  status: { type: String, enum: ['open', 'in_review', 'assigned', 'resolved', 'closed'], default: 'open' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  attachments: [{ type: String }],
  messages: [messageSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

complaintSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Complaint', complaintSchema);
