const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

let appInstance = null;

function initFirebase() {
  if (appInstance) return appInstance;

  const servicePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!servicePath) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is not set');
  }

  const resolved = path.resolve(servicePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Firebase service account file not found at path: ${resolved}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8'));

  appInstance = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return appInstance;
}

function getMessaging() {
  const app = initFirebase();
  return admin.messaging(app);
}

module.exports = { initFirebase, getMessaging };
