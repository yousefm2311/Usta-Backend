const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan', required: true },
  createdAt: { type: Date, default: Date.now },
});

favoriteSchema.index({ customerId: 1, artisanId: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);

