const Notification = require('../../models/notification.model');
const { dataResponse } = require('../../utils/shared/responder');

async function getNotifications(req, res) {
  const rows = await Notification.find({ customerId: req.user._id }).sort({ createdAt: -1 }).limit(100);
  return res.json(dataResponse({ notifications: rows }));
}

async function markRead(req, res) {
  const { id } = req.params; await Notification.updateOne({ _id: id, customerId: req.user._id }, { $set: { read: true, readAt: new Date() } });
  return res.json(dataResponse({ ok: true }));
}

async function remove(req, res) {
  const { id } = req.params; await Notification.deleteOne({ _id: id, customerId: req.user._id });
  return res.json(dataResponse({ ok: true }));
}

module.exports = { getNotifications, markRead, remove };


