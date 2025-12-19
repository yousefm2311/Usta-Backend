const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  password: { type: String, required: true },
  address: { type: String },
  photo: String,
  settings: {
    language: { type: String, default: 'ar' },
    theme: { type: String, default: 'light' },
  },
  notifications: {
    marketing: { type: Boolean, default: true },
    requests: { type: Boolean, default: true },
    chat: { type: Boolean, default: true },
  },
  fcmTokens: [{ type: String }],
  isOnline: { type: Boolean, default: false },
  unavailableUntil: { type: Date },
  availabilitySlots: [{
    _id: false,
    dayOfWeek: { type: Number, min: 0, max: 6 },
    from: { type: String },
    to: { type: String },
  }],
  tokenVersion: { type: Number, default: 0 },
  lastLogoutAt: { type: Date },
  blocked: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: false });

module.exports = mongoose.model('Customer', customerSchema);
