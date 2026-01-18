const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

let appInstance = null;
let initError = null;

function loadServiceAccount() {
  // Option 1: JSON in env (best for PM2/Docker)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT is set but not valid JSON");
    }
  }

  // Option 2: path in env
  const servicePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!servicePath) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is not set");
  }

  const resolved = path.resolve(servicePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Firebase service account file not found at path: ${resolved}`,
    );
  }

  const raw = fs.readFileSync(resolved, "utf8").trim();
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `Firebase service account file is not valid JSON: ${resolved}`,
    );
  }
}

function initFirebase() {
  if (appInstance) return appInstance;
  if (initError) throw initError;

  try {
    // Prevent re-init if someone else already initialized default app
    if (admin.apps && admin.apps.length > 0) {
      appInstance = admin.app();
      return appInstance;
    }

    const serviceAccount = loadServiceAccount();

    appInstance = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    return appInstance;
  } catch (e) {
    initError = e;
    throw e;
  }
}

function getMessaging() {
  initFirebase();
  return admin.messaging();
}

module.exports = { initFirebase, getMessaging };
