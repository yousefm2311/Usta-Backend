const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
  reply: { type: String },
  createdAt: { type: Date, default: Date.now },
  repliedAt: { type: Date },
});

reviewSchema.index({ artisanId: 1 });
reviewSchema.index({ customerId: 1 });

module.exports = mongoose.model('Review', reviewSchema);

