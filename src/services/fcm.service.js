const admin = require('firebase-admin');
const Artisan = require('../models/artisan.model');
const Customer = require('../models/customer.model');

let initialized = false;
function init() {
  if (initialized) return;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(json) });
      initialized = true;
    }
  } catch (e) {
    console.error('FCM init failed', e);
  }
}

async function getTokens(model, idField, id) {
  const doc = await model.findById(id).select('fcmTokens');
  return doc?.fcmTokens?.filter(Boolean) || [];
}

async function send(tokens, title, body, data) {
  init();
  if (!initialized || !tokens.length) return { ok: false, reason: 'no_tokens_or_not_initialized' };
  const message = {
    notification: { title, body },
    data: data || {},
    android: { priority: 'high', notification: { clickAction: 'FLUTTER_NOTIFICATION_CLICK' } },
    apns: { headers: { 'apns-priority': '10' } },
    tokens,
  };
  try {
    const resp = await admin.messaging().sendMulticast(message);
    return { ok: true, response: resp };
  } catch (e) {
    console.error('FCM send error', e);
    return { ok: false, reason: e?.message || 'send_failed' };
  }
}

async function sendToUser(userId, title, body, data) {
  const tokens = await getTokens(Customer, '_id', userId);
  return send(tokens, title, body, data);
}

async function sendToArtisan(artisanId, title, body, data) {
  const tokens = await getTokens(Artisan, '_id', artisanId);
  return send(tokens, title, body, data);
}

module.exports = { sendToUser, sendToArtisan };
