const { ApiError } = require("../../errors/apiError");

const REDACTED_KEYS = new Set([
  "password",
  "token",
  "refreshToken",
  "authorization",
  "idFrontImage",
  "idBackImage",
  "selfieImage",
  "rejectionReasonInternal",
]);

function sanitizeErrorDetails(value, key = "") {
  if (value == null) return value;
  if (REDACTED_KEYS.has(String(key).toLowerCase())) {
    return "[REDACTED]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeErrorDetails(item, key));
  }
  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [entryKey, entryValue]) => {
      acc[entryKey] = sanitizeErrorDetails(entryValue, entryKey);
      return acc;
    }, {});
  }
  return value;
}

function notFound(req, res) {
  res.status(404).json({
    error: "Not found",
    message: "Not found",
    code: 404,
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Ignore or transform client abort errors into a clean response.
  if (err && (err.code === "ECONNABORTED" || err.type === "request.aborted")) {
    const payload = {
      error: "Request aborted by client",
      message: "Request aborted by client",
      code: 499,
      details: sanitizeErrorDetails(err.details),
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    };
    if (process.env.NODE_ENV !== "production" && err.stack)
      payload.stack = err.stack;
    if (!res.headersSent) return res.status(499).json(payload);
    return;
  }

  console.error(err);
  const status = err instanceof ApiError ? err.status : err.status || 500;
  const message =
    err instanceof ApiError
      ? err.message
      : err.message || "Internal server error";
  const payload = {
    error: message,
    message,
    code: err.code || status,
    details: sanitizeErrorDetails(err.details),
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  };
  if (process.env.NODE_ENV !== "production" && err.stack)
    payload.stack = err.stack;
  if (!res.headersSent) res.status(status).json(payload);
}

module.exports = { notFound, errorHandler };
