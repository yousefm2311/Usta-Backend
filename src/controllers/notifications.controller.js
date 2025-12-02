const Artisan = require('../models/artisan.model');
const Customer = require('../models/customer.model');
const { ApiError } = require('../errors/apiError');
const { dataResponse } = require('../utils/responder');

async function saveToken(model, userId, token) {
  const doc = await model.findById(userId);
  if (!doc) throw ApiError.notFound('Account not found');
  const tokens = new Set(doc.fcmTokens || []);
  tokens.add(token);
  doc.fcmTokens = Array.from(tokens);
  await doc.save();
  return doc.fcmTokens;
}

async function listTokens(model, userId) {
  const doc = await model.findById(userId).select('fcmTokens');
  if (!doc) throw ApiError.notFound('Account not found');
  return doc.fcmTokens || [];
}

async function saveCustomerToken(req, res) {
  const { token } = req.body || {};
  const tokens = await saveToken(Customer, req.user._id, token);
  return res.json(dataResponse({ tokens }));
}

async function saveArtisanToken(req, res) {
  const { token } = req.body || {};
  const tokens = await saveToken(Artisan, req.user._id, token);
  return res.json(dataResponse({ tokens }));
}

async function listCustomerTokens(req, res) {
  const tokens = await listTokens(Customer, req.user._id);
  return res.json(dataResponse({ tokens }));
}

async function listArtisanTokens(req, res) {
  const tokens = await listTokens(Artisan, req.user._id);
  return res.json(dataResponse({ tokens }));
}

module.exports = { saveCustomerToken, saveArtisanToken, listCustomerTokens, listArtisanTokens };
