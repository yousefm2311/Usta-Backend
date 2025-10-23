const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  commission: { type: Number, default: 0.1 },
  features: { type: Object, default: {} },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Setting', settingsSchema);

