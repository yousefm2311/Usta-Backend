const { ApiError } = require('../../errors/apiError');

function notFound(req, res) {
  res.status(404).json({
    error: 'Not found',
    message: 'Not found',
    code: 404,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err instanceof ApiError ? err.status : (err.status || 500);
  const message = err instanceof ApiError ? err.message : (err.message || 'Internal server error');
  const payload = {
    error: message,
    message,
    code: err.code || status,
    details: err.details,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  };
  if (process.env.NODE_ENV !== 'production' && err.stack) payload.stack = err.stack;
  if (!res.headersSent) res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };

