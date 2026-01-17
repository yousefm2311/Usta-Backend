const { ApiError } = require('../errors/apiError');
const fcmService = require('../services/fcm.service');
const Customer = require('../models/customer.model');
const Artisan = require('../models/artisan.model');
const Admin = require('../models/admin.model');
const ActivityLog = require('../models/activityLog.model');

async function sendToAudience(req, res) {
  const { audience, topic, title, body, data, customerIds, artisanIds, adminIds } = req.body || {};
  if (!title || !body) throw ApiError.badRequest('title and body are required');
  const notif = { title: String(title), body: String(body) };
  const kind = String(audience || '');
  const topicMap = {
    all: 'all',
    customers: 'role_customers',
    artisans: 'role_artisans',
    admins: 'role_admins',
  };
  const baseLog = { adminId: req.admin?._id, title: notif.title, audience: kind, createdAt: new Date() };
  if (['all', 'customers', 'artisans', 'admins', 'segment'].includes(kind)) {
    const targetTopic = kind === 'segment' ? topic : topicMap[kind];
    if (!targetTopic) throw ApiError.badRequest('topic is required');
    if (!/^[a-z0-9_]+$/.test(targetTopic)) throw ApiError.badRequest('Invalid topic');
    if (kind === 'segment' && !targetTopic.startsWith('seg_')) throw ApiError.badRequest('Invalid segment topic');
    const resp = await fcmService.sendToTopic(targetTopic, notif.title, notif.body, data);
    if (!resp.ok) return res.status(503).json({ ok: false, error: resp.error });
    await ActivityLog.create({
      actor: { id: req.admin?._id, type: 'admin', name: req.admin?.name },
      action: 'notifications_broadcast',
      entity: 'notifications',
      after: {
        ...baseLog,
        topic: targetTopic,
        selectedCounts: null,
        tokensCount: null,
      },
    });
    return res.json({ ok: true, audience: kind, topicUsed: targetTopic });
  }
  if (kind === 'selected') {
    const cIds = Array.isArray(customerIds) ? customerIds : [];
    const aIds = Array.isArray(artisanIds) ? artisanIds : [];
    const adIds = Array.isArray(adminIds) ? adminIds : [];
    if (!cIds.length && !aIds.length && !adIds.length) {
      throw ApiError.badRequest('customerIds or artisanIds or adminIds required');
    }
    const [cTokens, aTokens, adTokens] = await Promise.all([
      fcmService.getTokensByIds(Customer, cIds),
      fcmService.getTokensByIds(Artisan, aIds),
      fcmService.getTokensByIds(Admin, adIds),
    ]);
    const tokens = Array.from(new Set([...cTokens, ...aTokens, ...adTokens]));
    const resp = await fcmService.sendToTokens(tokens, notif.title, notif.body, data);
    if (!resp.ok) return res.status(503).json({ ok: false, error: resp.error });
    await ActivityLog.create({
      actor: { id: req.admin?._id, type: 'admin', name: req.admin?.name },
      action: 'notifications_broadcast',
      entity: 'notifications',
      after: {
        ...baseLog,
        audience: 'selected',
        selectedCounts: { customers: cIds.length, artisans: aIds.length, admins: adIds.length },
        tokensCount: resp.tokensCount || tokens.length,
      },
    });
    return res.json({
      ok: true,
      audience: 'selected',
      tokensCount: resp.tokensCount || tokens.length,
      successCount: resp.successCount || 0,
      failureCount: resp.failureCount || 0,
    });
  }
  throw ApiError.badRequest('Invalid audience');
}

module.exports = { sendToAudience };
