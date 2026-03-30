const ActivityLog = require('../../models/activityLog.model');

const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'refreshToken',
  'authorization',
  'idFrontImage',
  'idBackImage',
  'selfieImage',
  'rejectionReasonInternal',
]);

function sanitizeLogValue(value, parentKey = '') {
  if (value == null) return value;
  const normalizedKey = String(parentKey || '').toLowerCase();
  if (SENSITIVE_KEYS.has(normalizedKey)) {
    return REDACTED_VALUE;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, parentKey));
  }
  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, entryValue]) => {
      acc[key] = sanitizeLogValue(entryValue, key);
      return acc;
    }, {});
  }
  return value;
}

function buildActorContext({ admin, user, systemName } = {}) {
  if (admin) {
    return {
      id: admin._id,
      type: 'admin',
      name: admin.name,
    };
  }
  if (user) {
    return {
      id: user._id,
      type: 'artisan',
      name: user.name,
    };
  }
  if (systemName) {
    return {
      type: 'system',
      name: systemName,
    };
  }
  return undefined;
}

async function logActivity({
  req,
  admin,
  user,
  systemName,
  action,
  entity,
  entityId,
  before,
  after,
  metadata,
}) {
  try {
    await ActivityLog.create({
      actor: buildActorContext({
        admin: admin || req?.admin,
        user: user || req?.user,
        systemName,
      }),
      action,
      entity,
      entityId,
      before: sanitizeLogValue(before),
      after: sanitizeLogValue(after),
      metadata: sanitizeLogValue(metadata),
    });
  } catch (error) {
    console.error('Activity log error', error);
  }
}

module.exports = {
  logActivity,
};
