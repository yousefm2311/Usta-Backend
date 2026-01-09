const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], index: '2dsphere' },
}, { _id: false });

const defaultExpiresAt = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

const requestSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan' },
  serviceType: { type: String },
  description: { type: String },
  images: [{ type: String }],
  status: {
    type: String,
    enum: [
      'new',
      'assigned',
      'accepted',
      'in_progress',
      'awaiting_confirmation',
      'completed',
      'cancelled',
      'rejected',
      'closed',
      'expired',
      'priced',
      'awaiting_customer_price_confirm',
      'price_rejected',
      'need_new_price',
    ],
    default: 'new',
  },
  cancelledBy: { type: String, enum: ['customer', 'artisan'], default: undefined },
  price: { type: Number },
  agreedPrice: { type: Number },
  paidAmount: { type: Number },
  couponCode: { type: String },
  couponDiscount: { type: Number },
  address: { type: String },
  cancelReason: { type: String },
  acceptedAt: { type: Date },
  rejectedAt: { type: Date },
  completedAt: { type: Date },
  confirmedAt: { type: Date },
  cancelledAt: { type: Date },
  location: pointSchema,
  pricing: {
    proposedPrice: { type: Number },
    customerDecision: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    customerNotes: { type: String },
    decidedAt: { type: Date },
    currency: { type: String, default: 'EGP' },
  },
  payment: {
    required: { type: Boolean, default: false },
    status: { type: String, enum: ['unpaid', 'pending', 'paid', 'failed'], default: 'unpaid' },
    provider: { type: String },
    transactionId: { type: String },
    amount: { type: Number },
    updatedAt: { type: Date },
  },
  timeline: [
    {
      at: { type: Date, default: Date.now },
      by: { type: mongoose.Schema.Types.ObjectId },
      role: { type: String, enum: ['customer', 'artisan', 'system'] },
      action: { type: String },
      meta: { type: mongoose.Schema.Types.Mixed },
    },
  ],
  expiresAt: { type: Date, default: defaultExpiresAt },
  expiredAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

requestSchema.index({ serviceType: 1, status: 1 });
requestSchema.index({ customerId: 1, status: 1 });
requestSchema.index({ artisanId: 1, status: 1 });

module.exports = mongoose.model('Request', requestSchema);
