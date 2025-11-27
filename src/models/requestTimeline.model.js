const mongoose = require('mongoose');

const requestTimelineSchema = new mongoose.Schema({
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  status: { type: String, required: true },
  note: { type: String },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  createdAt: { type: Date, default: Date.now },
});

requestTimelineSchema.index({ requestId: 1, createdAt: -1 });

module.exports = mongoose.model('RequestTimeline', requestTimelineSchema);
