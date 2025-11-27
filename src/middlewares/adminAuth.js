const jwt = require('jsonwebtoken');
const Admin = require('../models/admin.model');

async function adminAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const [type, token] = hdr.split(' ');
    if (type !== 'Bearer' || !token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    if (!payload?.sub || payload?.kind !== 'admin') return res.status(401).json({ error: 'Unauthorized' });
    const admin = await Admin.findOne({ _id: payload.sub, deleted: { $ne: true } });
    if (!admin) return res.status(401).json({ error: 'Unauthorized' });
    const tokenVersion = payload.tokenVersion || 0;
    const currentVersion = admin.tokenVersion || 0;
    if (tokenVersion !== currentVersion) return res.status(401).json({ error: 'Unauthorized' });
    const issuedAt = payload.iat ? payload.iat * 1000 : 0;
    if (admin.lastLogoutAt && issuedAt < admin.lastLogoutAt.getTime()) return res.status(401).json({ error: 'Unauthorized' });
    req.admin = admin;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.admin.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = { adminAuth, requireRole };
