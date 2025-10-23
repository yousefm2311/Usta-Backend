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

