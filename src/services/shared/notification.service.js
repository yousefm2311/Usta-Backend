const { getMessaging } = require('../../config/firebase');

async function sendToToken({ token, notification, data }) {
  const messaging = getMessaging();
  return messaging.send({ token, notification, data });
}

async function sendToTopic({ topic, notification, data }) {
  const messaging = getMessaging();
  return messaging.send({ topic, notification, data });
}

module.exports = { sendToToken, sendToTopic };


