const jwt = require('jsonwebtoken');
const Artisan = require('../models/artisan.model');
const Customer = require('../models/customer.model');
const { ApiError } = require('../errors/apiError');

function getToken(req) {
  const hdr = req.headers.authorization || '';
  const [type, token] = hdr.split(' ');
  if (type === 'Bearer' && token) return token;
  return null;
}

function authError(res, status, message) {
  const payload = {
    error: message || 'Unauthorized',
    message: message || 'Unauthorized',
    code: status || 401,
    path: res.req?.originalUrl,
    method: res.req?.method,
    timestamp: new Date().toISOString(),
  };
  return res.status(status || 401).json(payload);
}

function auth(role) {
  return async (req, res, next) => {
    try {
      const token = getToken(req);
      if (!token) return authError(res, 401, 'Unauthorized');
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      if (!payload?.sub) return authError(res, 401, 'Invalid token');
      let user = null;
      if (role === 'artisan') user = await Artisan.findOne({ _id: payload.sub, deleted: { $ne: true } });
      if (role === 'customer') user = await Customer.findOne({ _id: payload.sub, deleted: { $ne: true } });
      if (!user) return authError(res, 401, 'Account not found');
      const tokenVersion = payload.tokenVersion || 0;
      const currentVersion = user.tokenVersion || 0;
      if (tokenVersion !== currentVersion) return authError(res, 401, 'Session expired');
      const issuedAt = payload.iat ? payload.iat * 1000 : 0;
      if (user.lastLogoutAt && issuedAt < user.lastLogoutAt.getTime()) return authError(res, 401, 'Session expired');
      if (role === 'customer' && user.blocked) return authError(res, 403, 'Your account is blocked by admin');
      if (role === 'artisan') {
        if (user.suspended) return authError(res, 403, 'Your account is suspended by admin');
        if (!user.verified) return authError(res, 403, 'Your account is pending admin approval');
      }
      req.user = user;
      req.userRole = role;
      next();
    } catch (e) {
      return authError(res, 401, 'Unauthorized');
    }
  };
}

async function authAny(req, res, next) {
  try {
    const hdr = req.headers.authorization || '';
    const [type, token] = hdr.split(' ');
    if (type !== 'Bearer' || !token) return authError(res, 401, 'Unauthorized');
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    if (!payload?.sub) return authError(res, 401, 'Invalid token');
    const [artisan, customer] = await Promise.all([
      Artisan.findOne({ _id: payload.sub, deleted: { $ne: true } }),
      Customer.findOne({ _id: payload.sub, deleted: { $ne: true } }),
    ]);
    if (artisan) {
      const tokenVersion = payload.tokenVersion || 0;
      const currentVersion = artisan.tokenVersion || 0;
      if (tokenVersion !== currentVersion) return authError(res, 401, 'Session expired');
      const issuedAt = payload.iat ? payload.iat * 1000 : 0;
      if (artisan.lastLogoutAt && issuedAt < artisan.lastLogoutAt.getTime()) return authError(res, 401, 'Session expired');
      if (artisan.suspended) return authError(res, 403, 'Your account is suspended by admin');
      if (!artisan.verified) return authError(res, 403, 'Your account is pending admin approval');
      req.user = artisan; req.userRole = 'artisan'; return next();
    }
    if (customer) {
      const tokenVersion = payload.tokenVersion || 0;
      const currentVersion = customer.tokenVersion || 0;
      if (tokenVersion !== currentVersion) return authError(res, 401, 'Session expired');
      const issuedAt = payload.iat ? payload.iat * 1000 : 0;
      if (customer.lastLogoutAt && issuedAt < customer.lastLogoutAt.getTime()) return authError(res, 401, 'Session expired');
      if (customer.blocked) return authError(res, 403, 'Your account is blocked by admin');
      req.user = customer; req.userRole = 'customer'; return next();
    }
    return authError(res, 401, 'Account not found');
  } catch (e) {
    return authError(res, 401, 'Unauthorized');
  }
}

module.exports = { auth, authAny };
