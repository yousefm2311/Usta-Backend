const mongoose = require('mongoose');
const { calculateProfileCompletion } = require('../utils/profileCompletion');

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
  profileCompletion: { type: Number, default: 0 },
  missingFields: { type: [String], default: [] },
  isProfileCompleted: { type: Boolean, default: false },
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
  fcmDevices: [{
    deviceId: { type: String, required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ['android', 'ios', 'web'] },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  }],
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

const completionSelect = 'name phone avatar location serviceType description portfolioImages profession services portfolio pricing';

function setByPath(obj, path, value) {
  const parts = String(path).split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (!curr[key] || typeof curr[key] !== 'object') curr[key] = {};
    curr = curr[key];
  }
  curr[parts[parts.length - 1]] = value;
}

function unsetByPath(obj, path) {
  const parts = String(path).split('.');
  let curr = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!curr || typeof curr !== 'object') return;
    curr = curr[parts[i]];
  }
  if (curr && typeof curr === 'object') delete curr[parts[parts.length - 1]];
}

function getByPath(obj, path) {
  const parts = String(path).split('.');
  let curr = obj;
  for (const part of parts) {
    if (!curr || typeof curr !== 'object') return undefined;
    curr = curr[part];
  }
  return curr;
}

function normalizeUpdate(update) {
  const ops = { $set: {}, $unset: {}, $push: {}, $addToSet: {}, $pull: {} };
  if (Array.isArray(update)) {
    for (const stage of update) {
      if (stage.$set) Object.assign(ops.$set, stage.$set);
      if (stage.$unset) Object.assign(ops.$unset, stage.$unset);
      if (stage.$push) Object.assign(ops.$push, stage.$push);
      if (stage.$addToSet) Object.assign(ops.$addToSet, stage.$addToSet);
      if (stage.$pull) Object.assign(ops.$pull, stage.$pull);
    }
    return ops;
  }
  for (const [key, value] of Object.entries(update || {})) {
    if (key.startsWith('$')) {
      if (ops[key]) Object.assign(ops[key], value || {});
    } else {
      ops.$set[key] = value;
    }
  }
  return ops;
}

function applyArrayPush(obj, path, value) {
  const current = getByPath(obj, path);
  const next = Array.isArray(current) ? current.slice() : [];
  if (value && typeof value === 'object' && Array.isArray(value.$each)) {
    next.push(...value.$each);
  } else {
    next.push(value);
  }
  setByPath(obj, path, next);
}

function applyArrayAddToSet(obj, path, value) {
  const current = getByPath(obj, path);
  const next = Array.isArray(current) ? current.slice() : [];
  const items = value && typeof value === 'object' && Array.isArray(value.$each) ? value.$each : [value];
  for (const item of items) {
    if (!next.some((v) => Object.is(v, item))) next.push(item);
  }
  setByPath(obj, path, next);
}

function applyArrayPull(obj, path, value) {
  const current = getByPath(obj, path);
  if (!Array.isArray(current)) return;
  let next = current.slice();
  if (value && typeof value === 'object' && Array.isArray(value.$in)) {
    next = next.filter((v) => !value.$in.some((x) => Object.is(x, v)));
  } else if (value && typeof value === 'object' && value._id !== undefined) {
    const id = String(value._id);
    next = next.filter((v) => String(v?._id) !== id);
  } else {
    next = next.filter((v) => !Object.is(v, value));
  }
  setByPath(obj, path, next);
}

function applyUpdateToObject(current, update) {
  const next = current ? { ...current } : {};
  const ops = normalizeUpdate(update);
  for (const [path, value] of Object.entries(ops.$set)) setByPath(next, path, value);
  for (const [path] of Object.entries(ops.$unset)) unsetByPath(next, path);
  for (const [path, value] of Object.entries(ops.$push)) applyArrayPush(next, path, value);
  for (const [path, value] of Object.entries(ops.$addToSet)) applyArrayAddToSet(next, path, value);
  for (const [path, value] of Object.entries(ops.$pull)) applyArrayPull(next, path, value);
  return next;
}

function applyCompletion(doc) {
  const { percent, missingFields } = calculateProfileCompletion(doc);
  doc.profileCompletion = percent;
  doc.missingFields = missingFields;
  doc.isProfileCompleted = percent === 100;
}

async function applyCompletionForUpdate(query) {
  const update = query.getUpdate() || {};
  const current = await query.model.findOne(query.getQuery()).select(completionSelect).lean();
  const merged = applyUpdateToObject(current || {}, update);
  const { percent, missingFields } = calculateProfileCompletion(merged);
  const set = { profileCompletion: percent, missingFields, isProfileCompleted: percent === 100 };
  if (Array.isArray(update)) {
    update.push({ $set: set });
    query.setUpdate(update);
    return;
  }
  update.$set = { ...(update.$set || {}), ...set };
  query.setUpdate(update);
}

artisanSchema.pre('save', function saveHook(next) {
  applyCompletion(this);
  next();
});

artisanSchema.pre(['findOneAndUpdate', 'updateOne'], async function updateHook(next) {
  try {
    await applyCompletionForUpdate(this);
    next();
  } catch (err) {
    next(err);
  }
});

// Ensure geospatial queries ($geoNear) have a 2dsphere index on the location field
artisanSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Artisan', artisanSchema);
