const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  actor: {
    id: { type: mongoose.Schema.Types.ObjectId },
    type: { type: String, default: 'admin' },
    name: { type: String },
  },
  action: { type: String, required: true },
  entity: { type: String },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  before: { type: Object },
  after: { type: Object },
  createdAt: { type: Date, default: Date.now },
});

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ entity: 1, entityId: 1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
