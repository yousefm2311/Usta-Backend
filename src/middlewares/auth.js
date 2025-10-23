const jwt = require('jsonwebtoken');
const Artisan = require('../models/artisan.model');
const Customer = require('../models/customer.model');

function getToken(req) {
  const hdr = req.headers.authorization || '';
  const [type, token] = hdr.split(' ');
  if (type === 'Bearer' && token) return token;
  return null;
}

function auth(role) {
  return async (req, res, next) => {
    try {
      const token = getToken(req);
      if (!token) return res.status(401).json({ error: 'Unauthorized' });
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      if (!payload?.sub) return res.status(401).json({ error: 'Invalid token' });
      let user = null;
      if (role === 'artisan') user = await Artisan.findOne({ _id: payload.sub, deleted: { $ne: true } });
      if (role === 'customer') user = await Customer.findOne({ _id: payload.sub, deleted: { $ne: true } });
      if (!user) return res.status(401).json({ error: 'Account not found' });
      req.user = user;
      req.userRole = role;
      next();
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

async function authAny(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const [type, token] = hdr.split(' ');
    if (type !== 'Bearer' || !token) return res.status(401).json({ error: 'Unauthorized' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    if (!payload?.sub) return res.status(401).json({ error: 'Invalid token' });
    const [artisan, customer] = await Promise.all([
      Artisan.findOne({ _id: payload.sub, deleted: { $ne: true } }),
      Customer.findOne({ _id: payload.sub, deleted: { $ne: true } }),
    ]);
    if (artisan) { req.user = artisan; req.userRole = 'artisan'; return next(); }
    if (customer) { req.user = customer; req.userRole = 'customer'; return next(); }
    return res.status(401).json({ error: 'Account not found' });
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

module.exports = { auth, authAny };
