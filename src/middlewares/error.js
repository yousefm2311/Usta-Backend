const { ApiError } = require('../errors/apiError');

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err instanceof ApiError ? err.status : (err.status || 500);
  const message = err instanceof ApiError ? err.message : (err.message || 'Internal server error');
  const payload = { error: message };
  if (err.details) payload.details = err.details;
  if (!res.headersSent) res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };
