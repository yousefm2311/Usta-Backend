const mongoose = require('mongoose');

const notificationTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  target: { type: String, enum: ['customers', 'artisans', 'all'], default: 'all' },
  title: { type: String, required: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

notificationTemplateSchema.index({ target: 1, updatedAt: -1 });

module.exports = mongoose.model('NotificationTemplate', notificationTemplateSchema);
