const { ApiError } = require('../errors/apiError');
const { dataResponse } = require('../utils/responder');
const notificationService = require('../services/notification.service');

function validateNotificationBody(body) {
  if (!body || typeof body !== 'object') throw ApiError.badRequest('notification required');
  const { title, body: text } = body;
  if (!title || !text) throw ApiError.badRequest('notification.title and notification.body are required');
  return { title: String(title), body: String(text) };
}

async function sendToToken(req, res) {
  const { token, notification, data } = req.body || {};
  if (!token || typeof token !== 'string') throw ApiError.badRequest('token is required');
  const notif = validateNotificationBody(notification);
  const resp = await notificationService.sendToToken({ token, notification: notif, data });
  return res.json(dataResponse({ id: resp }));
}

async function sendToTopic(req, res) {
  const { topic, notification, data } = req.body || {};
  if (!topic || typeof topic !== 'string') throw ApiError.badRequest('topic is required');
  const notif = validateNotificationBody(notification);
  const resp = await notificationService.sendToTopic({ topic, notification: notif, data });
  return res.json(dataResponse({ id: resp }));
}

module.exports = { sendToToken, sendToTopic };
