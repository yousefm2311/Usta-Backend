class ApiError extends Error {
  constructor(status, message, details) {
    super(message || 'Error');
    this.status = status || 500;
    if (details) this.details = details;
  }
  static badRequest(msg, details) { return new ApiError(400, msg || 'Bad request', details); }
  static unauthorized(msg) { return new ApiError(401, msg || 'Unauthorized'); }
  static forbidden(msg) { return new ApiError(403, msg || 'Forbidden'); }
  static notFound(msg) { return new ApiError(404, msg || 'Not found'); }
  static conflict(msg) { return new ApiError(409, msg || 'Conflict'); }
}

module.exports = { ApiError };

