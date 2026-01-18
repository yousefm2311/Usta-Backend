const Notification = require("../../models/notification.model");
const fcm = require("../../services/shared/fcm.service");

async function notifyUser({ customerId, artisanId, type, title, body, data }) {
  const targets = [];
  if (customerId) targets.push({ id: customerId, kind: "customer" });
  if (artisanId) targets.push({ id: artisanId, kind: "artisan" });
  if (!targets.length) return null;

  const docs = [];
  for (const target of targets) {
    const payload = { type, title, body };
    if (target.kind === "customer") payload.customerId = target.id;
    if (target.kind === "artisan") payload.artisanId = target.id;
    const doc = await Notification.create(payload);
    docs.push(doc);
    try {
      if (target.kind === "customer") {
        await fcm.sendToUser(target.id, title, body, data);
      } else {
        await fcm.sendToArtisan(target.id, title, body, data);
      }
    } catch (_) {
      // Best-effort FCM send.
    }
  }

  return docs.length === 1 ? docs[0] : docs;
}

module.exports = { notifyUser };


