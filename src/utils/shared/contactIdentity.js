const { ApiError } = require('../../errors/apiError');

function normalizeIdentity(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function requireEmailOrPhone(payload = {}) {
  const email = normalizeIdentity(payload.email);
  const phone = normalizeIdentity(payload.phone);
  if (!email && !phone) {
    throw ApiError.badRequest('email or phone required');
  }
  return { email, phone };
}

function buildEmailPhoneLookup(payload = {}) {
  const { email, phone } = requireEmailOrPhone(payload);
  const filters = [];
  if (phone) filters.push({ phone });
  if (email) filters.push({ email });
  return { $or: filters };
}

module.exports = {
  buildEmailPhoneLookup,
  normalizeIdentity,
  requireEmailOrPhone,
};
