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
  isOnline: { type: Boolean, default: false },
  unavailableUntil: { type: Date },
  availabilitySlots: [{
    _id: false,
    dayOfWeek: { type: Number, min: 0, max: 6 }, // 0 Sunday
    from: { type: String }, // HH:mm
    to: { type: String },   // HH:mm
  }],
  suspended: { type: Boolean, default: false },
  notifications: {
    marketing: { type: Boolean, default: true },
    requests: { type: Boolean, default: true },
    chat: { type: Boolean, default: true },
  },
  fcmTokens: [{ type: String }],
  selfEvaluation: {
    score: { type: Number },
    answers: { type: Object, default: {} },
    notes: { type: String },
    submittedAt: { type: Date },
  },
  tokenVersion: { type: Number, default: 0 },
  lastLogoutAt: { type: Date },
  verified: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Ensure geospatial queries ($geoNear) have a 2dsphere index on the location field
artisanSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Artisan', artisanSchema);
