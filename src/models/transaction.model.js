const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan' },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  credit: { type: Number, default: 0 },
  debit: { type: Number, default: 0 },
  type: { type: String, enum: ['earning', 'withdraw', 'payment', 'recharge'], required: true },
  method: { type: String },
  requestId: { type: mongoose.Schema.Types.ObjectId },
  status: { type: String, default: 'done' },
  createdAt: { type: Date, default: Date.now },
});

transactionSchema.index({ artisanId: 1, createdAt: 1 });
transactionSchema.index({ customerId: 1, createdAt: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);

