const admin = require('firebase-admin');
const Artisan = require('../models/artisan.model');
const Customer = require('../models/customer.model');
const Admin = require('../models/admin.model');

let initialized = false;
let initError = null;
function init() {
  if (initialized || initError) return;
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      initError = 'FIREBASE_SERVICE_ACCOUNT is missing';
      return;
    }
    const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(json) });
    initialized = true;
  } catch (e) {
    initError = 'FCM init failed';
    console.error('FCM init failed', e);
  }
}

function ensureInitialized() {
  init();
  if (!initialized) return { ok: false, error: initError || 'FCM not initialized' };
  return { ok: true };
}

function isValidTopic(topic) {
  return typeof topic === 'string' && /^[a-z0-9_]+$/.test(topic);
}

async function getTokens(model, idField, id) {
  const doc = await model.findById(id).select('fcmTokens fcmDevices');
  return extractTokens(doc);
}

function extractTokens(doc) {
  const tokens = new Set();
  const devices = Array.isArray(doc?.fcmDevices) ? doc.fcmDevices : [];
  for (const item of devices) {
    if (item && item.token) tokens.add(item.token);
  }
  const legacy = Array.isArray(doc?.fcmTokens) ? doc.fcmTokens : [];
  for (const token of legacy) {
    if (token) tokens.add(token);
  }
  return Array.from(tokens);
}

function stringifyData(data) {
  if (!data || typeof data !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') out[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = String(value);
    else out[key] = JSON.stringify(value);
  }
  return out;
}

async function send(tokens, title, body, data) {
  const initState = ensureInitialized();
  if (!initState.ok) return { ok: false, error: initState.error };
  if (!tokens.length) return { ok: false, error: 'no_tokens' };
  const invalidTokens = new Set();
  const responses = [];
  const invalidCodes = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
    'invalid-argument',
  ]);
  const chunkSize = 500;
  let successCount = 0;
  let failureCount = 0;
  for (let i = 0; i < tokens.length; i += chunkSize) {
    const batch = tokens.slice(i, i + chunkSize);
    const message = {
      notification: { title, body },
      data: stringifyData(data),
      android: { priority: 'high', notification: { clickAction: 'FLUTTER_NOTIFICATION_CLICK' } },
      apns: { headers: { 'apns-priority': '10' } },
      tokens: batch,
    };
    try {
      const resp = await admin.messaging().sendMulticast(message);
      responses.push(resp);
      successCount += resp.successCount || 0;
      failureCount += resp.failureCount || 0;
      resp.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = r.error?.code || r.error?.errorInfo?.code;
        if (invalidCodes.has(code)) invalidTokens.add(batch[idx]);
      });
    } catch (e) {
      console.error('FCM send error', e);
      return { ok: false, error: e?.message || 'send_failed' };
    }
  }
  return {
    ok: true,
    response: responses,
    tokensCount: tokens.length,
    successCount,
    failureCount,
    invalidTokens: Array.from(invalidTokens),
  };
}

async function sendToUser(userId, title, body, data) {
  const tokens = await getTokens(Customer, '_id', userId);
  const resp = await send(tokens, title, body, data);
  await cleanupInvalidTokens([Customer], resp.invalidTokens);
  return resp;
}

async function sendToArtisan(artisanId, title, body, data) {
  const tokens = await getTokens(Artisan, '_id', artisanId);
  const resp = await send(tokens, title, body, data);
  await cleanupInvalidTokens([Artisan], resp.invalidTokens);
  return resp;
}

async function sendToAdmin(adminId, title, body, data) {
  const tokens = await getTokens(Admin, '_id', adminId);
  const resp = await send(tokens, title, body, data);
  await cleanupInvalidTokens([Admin], resp.invalidTokens);
  return resp;
}

async function getTokensByIds(model, ids) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!list.length) return [];
  const rows = await model.find({ _id: { $in: list } }).select('fcmTokens fcmDevices').lean();
  const tokens = new Set();
  for (const doc of rows) {
    for (const token of extractTokens(doc)) tokens.add(token);
  }
  return Array.from(tokens);
}

async function subscribeTokensToTopic(tokens, topic) {
  if (!isValidTopic(topic)) return { ok: false, error: 'Invalid topic' };
  const initState = ensureInitialized();
  if (!initState.ok) return { ok: false, error: initState.error };
  if (!tokens.length) return { ok: false, error: 'no_tokens' };
  const chunkSize = 500;
  try {
    const responses = [];
    for (let i = 0; i < tokens.length; i += chunkSize) {
      const batch = tokens.slice(i, i + chunkSize);
      responses.push(await admin.messaging().subscribeToTopic(batch, topic));
    }
    return { ok: true, response: responses };
  } catch (e) {
    console.error('FCM subscribe error', e);
    return { ok: false, error: e?.message || 'subscribe_failed' };
  }
}

async function unsubscribeTokensFromTopic(tokens, topic) {
  if (!isValidTopic(topic)) return { ok: false, error: 'Invalid topic' };
  const initState = ensureInitialized();
  if (!initState.ok) return { ok: false, error: initState.error };
  if (!tokens.length) return { ok: false, error: 'no_tokens' };
  const chunkSize = 500;
  try {
    const responses = [];
    for (let i = 0; i < tokens.length; i += chunkSize) {
      const batch = tokens.slice(i, i + chunkSize);
      responses.push(await admin.messaging().unsubscribeFromTopic(batch, topic));
    }
    return { ok: true, response: responses };
  } catch (e) {
    console.error('FCM unsubscribe error', e);
    return { ok: false, error: e?.message || 'unsubscribe_failed' };
  }
}

async function sendToTokens(tokens, title, body, data) {
  const resp = await send(tokens, title, body, data);
  await cleanupInvalidTokens([Customer, Artisan, Admin], resp.invalidTokens);
  return resp;
}

async function sendToTopic(topic, title, body, data) {
  if (!isValidTopic(topic)) return { ok: false, error: 'Invalid topic' };
  const initState = ensureInitialized();
  if (!initState.ok) return { ok: false, error: initState.error };
  try {
    const message = {
      topic,
      notification: { title, body },
      data: stringifyData(data),
      android: { priority: 'high', notification: { clickAction: 'FLUTTER_NOTIFICATION_CLICK' } },
      apns: { headers: { 'apns-priority': '10' } },
    };
    const resp = await admin.messaging().send(message);
    return { ok: true, id: resp };
  } catch (e) {
    console.error('FCM send topic error', e);
    return { ok: false, error: e?.message || 'send_topic_failed' };
  }
}

async function cleanupInvalidTokens(models, tokens) {
  const list = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
  if (!list.length) return;
  const updates = models.map((model) => model.updateMany(
    {},
    {
      $pull: {
        fcmTokens: { $in: list },
        fcmDevices: { token: { $in: list } },
      },
    },
  ));
  await Promise.allSettled(updates);
}

module.exports = {
  sendToUser,
  sendToArtisan,
  sendToAdmin,
  sendToTokens,
  sendToTopic,
  getTokensByIds,
  subscribeTokensToTopic,
  unsubscribeTokensFromTopic,
  extractTokens,
  stringifyData,
  isValidTopic,
};
