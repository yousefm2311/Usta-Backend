const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan' },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  type: { type: String },
  title: { type: String },
  body: { type: String },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  readAt: { type: Date },
});

notificationSchema.index({ artisanId: 1, createdAt: 1 });
notificationSchema.index({ customerId: 1, createdAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema);

