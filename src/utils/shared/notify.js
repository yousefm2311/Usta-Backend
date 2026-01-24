const Notification = require("../../models/notification.model");
const fcm = require("../../services/shared/fcm.service");
const { localizeForTarget } = require("./notificationI18n");

async function notifyUser({ customerId, artisanId, type, title, body, data }) {
  const targets = [];
  if (customerId) targets.push({ id: customerId, kind: "customer" });
  if (artisanId) targets.push({ id: artisanId, kind: "artisan" });
  if (!targets.length) return null;

  const docs = [];
  for (const target of targets) {
    const localized = await localizeForTarget({
      kind: target.kind,
      id: target.id,
      title,
      body,
    });
    const payload = { type, title: localized.title, body: localized.body };
    if (target.kind === "customer") payload.customerId = target.id;
    if (target.kind === "artisan") payload.artisanId = target.id;
    const doc = await Notification.create(payload);
    docs.push(doc);
    try {
      if (target.kind === "customer") {
        await fcm.sendToUser(target.id, localized.title, localized.body, data);
      } else {
        await fcm.sendToArtisan(target.id, localized.title, localized.body, data);
      }
    } catch (_) {
      // Best-effort FCM send.
    }
  }

  return docs.length === 1 ? docs[0] : docs;
}

module.exports = { notifyUser };


