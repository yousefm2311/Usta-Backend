const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], index: '2dsphere' },
}, { _id: false });

const requestSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  artisanId: { type: mongoose.Schema.Types.ObjectId, ref: 'Artisan' },
  serviceType: { type: String },
  description: { type: String },
  images: [{ type: String }],
  status: { type: String, enum: ['new', 'assigned', 'accepted', 'in_progress', 'completed', 'cancelled', 'rejected', 'closed'], default: 'new' },
  cancelledBy: { type: String, enum: ['customer', 'artisan'], default: undefined },
  price: { type: Number },
  agreedPrice: { type: Number },
  paidAmount: { type: Number },
  couponCode: { type: String },
  couponDiscount: { type: Number },
  address: { type: String },
  cancelReason: { type: String },
  location: pointSchema,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

requestSchema.index({ serviceType: 1, status: 1 });
requestSchema.index({ customerId: 1, status: 1 });
requestSchema.index({ artisanId: 1, status: 1 });

module.exports = mongoose.model('Request', requestSchema);
