const ActivityLog = require('../../models/activityLog.model');

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
      before,
      after,
    });
  } catch (error) {
    console.error('Activity log error', error);
  }
}

module.exports = {
  logActivity,
};
