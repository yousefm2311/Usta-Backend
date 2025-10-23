const Notification = require('../models/notification.model');

async function getNotifications(req, res) {
  const rows = await Notification.find({ customerId: req.user._id }).sort({ createdAt: -1 }).limit(100);
  return res.json({ notifications: rows });
}

async function markRead(req, res) {
  const { id } = req.params; await Notification.updateOne({ _id: id, customerId: req.user._id }, { $set: { read: true, readAt: new Date() } });
  return res.json({ ok: true });
}

async function remove(req, res) {
  const { id } = req.params; await Notification.deleteOne({ _id: id, customerId: req.user._id });
  return res.json({ ok: true });
}

module.exports = { getNotifications, markRead, remove };

