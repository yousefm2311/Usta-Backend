const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['viewer', 'editor', 'super'], default: 'viewer' },
  tokenVersion: { type: Number, default: 0 },
  lastLogoutAt: { type: Date },
  fcmTokens: [{ type: String }],
  fcmDevices: [{
    deviceId: { type: String, required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ['android', 'ios', 'web'] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }],
  createdAt: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false },
});

module.exports = mongoose.model('Admin', adminSchema);
