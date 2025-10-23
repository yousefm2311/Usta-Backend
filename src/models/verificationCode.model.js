const mongoose = require('mongoose');

const verificationCodeSchema = new mongoose.Schema({
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan' },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  code: { type: String, required: true },
  type: { type: String, enum: ['signup', 'reset'], required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

verificationCodeSchema.index({ artisanId: 1, code: 1, type: 1 });
verificationCodeSchema.index({ customerId: 1, code: 1, type: 1 });
verificationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('VerificationCode', verificationCodeSchema);
