const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], default: 'Point' },
  coordinates: { type: [Number], index: '2dsphere' },
}, { _id: false });

const serviceSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  name: { type: String, required: true },
}, { _id: true });

const pricingSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  serviceName: String,
  min: Number,
  max: Number,
  currency: { type: String, default: 'EGP' },
}, { _id: true });

const portfolioSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  path: String,
  description: String,
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const artisanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  profession: { type: String, required: true },
  password: { type: String, required: true },
  description: String,
  address: String,
  avatar: String,
  status: { type: String, enum: ['available', 'busy'], default: 'available' },
  location: pointSchema,
  locationUpdatedAt: Date,
  services: [serviceSchema],
  pricing: [pricingSchema],
  portfolio: [portfolioSchema],
  paymentMethod: {
    type: { type: String, enum: ['vodafoneCash', 'bank'], default: undefined },
    details: { type: Object },
  },
  notifications: {
    marketing: { type: Boolean, default: true },
    requests: { type: Boolean, default: true },
    chat: { type: Boolean, default: true },
  },
  verified: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Artisan', artisanSchema);
