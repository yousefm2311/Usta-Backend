const crypto = require('crypto');
const Artisan = require('../models/artisan.model');
const Customer = require('../models/customer.model');
const Admin = require('../models/admin.model');
const { ApiError } = require('../errors/apiError');
const { dataResponse } = require('../utils/responder');
const fcmService = require('../services/fcm.service');

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

function isValidTopic(topic) {
  return typeof topic === 'string' && /^[a-z0-9_]+$/.test(topic);
}

function isSegmentTopic(topic) {
  return isValidTopic(topic) && topic.startsWith('seg_');
}

function toDeviceList(doc) {
  const devices = Array.isArray(doc?.fcmDevices) ? doc.fcmDevices : [];
  return devices.map((d) => ({
    deviceId: d.deviceId,
    token: d.token,
    platform: d.platform,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }));
}

function hashToken(token) {
  return crypto.createHash('sha1').update(String(token)).digest('hex').slice(0, 12);
}

function migrateLegacyTokens(doc, deviceId, token) {
  const legacy = Array.isArray(doc?.fcmTokens) ? doc.fcmTokens.filter(Boolean) : [];
  if (!legacy.length) return [];
  const devices = [];
  let usedIncoming = false;
  legacy.forEach((t, idx) => {
    if (!usedIncoming && token && t === token && deviceId) {
      devices.push({ deviceId, token: t, createdAt: new Date(), updatedAt: new Date() });
      usedIncoming = true;
    } else {
      devices.push({ deviceId: `legacy_${hashToken(t)}`, token: t, createdAt: new Date(), updatedAt: new Date() });
    }
  });
  return devices;
}

async function saveToken(model, userId, deviceId, token, platform, topics) {
  if (!deviceId) throw ApiError.badRequest('deviceId required');
  if (!token) throw ApiError.badRequest('token required');
  const doc = await model.findById(userId);
  if (!doc) throw ApiError.notFound('Account not found');
  let devices = toDeviceList(doc);
  if (!devices.length) {
    const migrated = migrateLegacyTokens(doc, deviceId, token);
    if (migrated.length) devices = migrated;
  }
  const index = devices.findIndex((d) => d.deviceId === deviceId);
  if (index >= 0 && devices[index].token === token) {
    return { changed: false };
  }
  const now = new Date();
  const next = {
    deviceId,
    token,
    platform: platform || devices[index]?.platform,
    createdAt: devices[index]?.createdAt || now,
    updatedAt: now,
  };
  if (index >= 0) devices[index] = next;
  else devices.push({ ...next, createdAt: now });
  const tokens = Array.from(new Set(devices.map((d) => d.token).filter(Boolean)));
  doc.fcmDevices = devices;
  doc.fcmTokens = tokens;
  await doc.save();
  const uniqueTopics = Array.isArray(topics) ? topics.filter(Boolean) : [];
  if (uniqueTopics.length) {
    for (const topic of uniqueTopics) {
      try {
        await fcmService.subscribeTokensToTopic([token], topic);
      } catch (_) {
        // best-effort
      }
    }
  }
  return { changed: true };
}

async function listTokens(model, userId, deviceId) {
  const doc = await model.findById(userId).select('fcmTokens fcmDevices');
  if (!doc) throw ApiError.notFound('Account not found');
  if (deviceId) {
    const devices = toDeviceList(doc);
    const match = devices.find((d) => d.deviceId === deviceId);
    return match?.token ? [match.token] : [];
  }
  return extractTokens(doc);
}

async function subscribeTopic(model, userId, topic, deviceId) {
  if (!isValidTopic(topic)) throw ApiError.badRequest('Invalid topic');
  const tokens = await listTokens(model, userId, deviceId);
  const resp = await fcmService.subscribeTokensToTopic(tokens, topic);
  if (!resp.ok) throw ApiError.badRequest(resp.error || 'FCM subscribe failed');
  return { ok: resp.ok, reason: resp.reason, tokensCount: tokens.length };
}

async function unsubscribeTopic(model, userId, topic, deviceId) {
  if (!isValidTopic(topic)) throw ApiError.badRequest('Invalid topic');
  const tokens = await listTokens(model, userId, deviceId);
  const resp = await fcmService.unsubscribeTokensFromTopic(tokens, topic);
  if (!resp.ok) throw ApiError.badRequest(resp.error || 'FCM unsubscribe failed');
  return { ok: resp.ok, reason: resp.reason, tokensCount: tokens.length };
}

async function listCustomerTokensById(req, res) {
  const tokens = await listTokens(Customer, req.params.id, req.query.deviceId);
  return res.json(dataResponse({ tokens }));
}

async function listArtisanTokensById(req, res) {
  const tokens = await listTokens(Artisan, req.params.id, req.query.deviceId);
  return res.json(dataResponse({ tokens }));
}

async function saveCustomerToken(req, res) {
  const { token, deviceId, platform } = req.body || {};
  const result = await saveToken(Customer, req.user._id, deviceId, token, platform, ['all', 'role_customers']);
  return res.json({ ok: true, changed: result.changed });
}

async function saveArtisanToken(req, res) {
  const { token, deviceId, platform } = req.body || {};
  const result = await saveToken(Artisan, req.user._id, deviceId, token, platform, ['all', 'role_artisans']);
  return res.json({ ok: true, changed: result.changed });
}

async function saveAdminToken(req, res) {
  const { token, deviceId, platform } = req.body || {};
  const result = await saveToken(Admin, req.admin._id, deviceId, token, platform, ['all', 'role_admins']);
  return res.json({ ok: true, changed: result.changed });
}

async function listCustomerTokens(req, res) {
  const tokens = await listTokens(Customer, req.user._id, req.query.deviceId);
  return res.json(dataResponse({ tokens }));
}

async function listArtisanTokens(req, res) {
  const tokens = await listTokens(Artisan, req.user._id, req.query.deviceId);
  return res.json(dataResponse({ tokens }));
}

async function listAdminTokens(req, res) {
  const tokens = await listTokens(Admin, req.admin._id, req.query.deviceId);
  return res.json(dataResponse({ tokens }));
}

async function subscribeCustomerTopic(req, res) {
  const { topic, deviceId } = req.body || {};
  if (topic && topic.startsWith('seg_') && !isSegmentTopic(topic)) throw ApiError.badRequest('Invalid segment topic');
  const data = await subscribeTopic(Customer, req.user._id, topic, deviceId);
  return res.json(dataResponse(data));
}

async function unsubscribeCustomerTopic(req, res) {
  const { topic, deviceId } = req.body || {};
  if (topic && topic.startsWith('seg_') && !isSegmentTopic(topic)) throw ApiError.badRequest('Invalid segment topic');
  const data = await unsubscribeTopic(Customer, req.user._id, topic, deviceId);
  return res.json(dataResponse(data));
}

async function subscribeArtisanTopic(req, res) {
  const { topic, deviceId } = req.body || {};
  if (topic && topic.startsWith('seg_') && !isSegmentTopic(topic)) throw ApiError.badRequest('Invalid segment topic');
  const data = await subscribeTopic(Artisan, req.user._id, topic, deviceId);
  return res.json(dataResponse(data));
}

async function unsubscribeArtisanTopic(req, res) {
  const { topic, deviceId } = req.body || {};
  if (topic && topic.startsWith('seg_') && !isSegmentTopic(topic)) throw ApiError.badRequest('Invalid segment topic');
  const data = await unsubscribeTopic(Artisan, req.user._id, topic, deviceId);
  return res.json(dataResponse(data));
}

async function subscribeAdminTopic(req, res) {
  const { topic, deviceId } = req.body || {};
  if (topic && topic.startsWith('seg_') && !isSegmentTopic(topic)) throw ApiError.badRequest('Invalid segment topic');
  const data = await subscribeTopic(Admin, req.admin._id, topic, deviceId);
  return res.json(dataResponse(data));
}

async function unsubscribeAdminTopic(req, res) {
  const { topic, deviceId } = req.body || {};
  if (topic && topic.startsWith('seg_') && !isSegmentTopic(topic)) throw ApiError.badRequest('Invalid segment topic');
  const data = await unsubscribeTopic(Admin, req.admin._id, topic, deviceId);
  return res.json(dataResponse(data));
}

module.exports = {
  saveCustomerToken,
  saveArtisanToken,
  saveAdminToken,
  listCustomerTokens,
  listArtisanTokens,
  listAdminTokens,
  listCustomerTokensById,
  listArtisanTokensById,
  subscribeCustomerTopic,
  unsubscribeCustomerTopic,
  subscribeArtisanTopic,
  unsubscribeArtisanTopic,
  subscribeAdminTopic,
  unsubscribeAdminTopic,
};
