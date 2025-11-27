const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  commission: { type: Number, default: 0.1 },
  features: { type: Object, default: {} },
  general: {
    appName: { type: String, default: 'Usta' },
    supportEmail: { type: String, default: 'support@usta.com' },
    about: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
  },
  rewards: {
    levels: { type: Array, default: [] },
    history: { type: Array, default: [] },
  },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Setting', settingsSchema);
