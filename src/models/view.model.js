const mongoose = require('mongoose');

const viewSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan', required: true },
  createdAt: { type: Date, default: Date.now },
});

viewSchema.index({ customerId: 1, createdAt: 1 });

module.exports = mongoose.model('View', viewSchema);

