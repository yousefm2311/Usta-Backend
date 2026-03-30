class ApiError extends Error {
  constructor(status, message, details, code) {
    super(message || 'Error');
    this.status = status || 500;
    if (details) this.details = details;
    this.code = code || status || 500;
  }
  static badRequest(msg, details, code) { return new ApiError(400, msg || 'Bad request', details, code); }
  static unauthorized(msg, details, code) { return new ApiError(401, msg || 'Unauthorized', details, code); }
  static forbidden(msg, details, code) { return new ApiError(403, msg || 'Forbidden', details, code); }
  static notFound(msg, details, code) { return new ApiError(404, msg || 'Not found', details, code); }
  static conflict(msg, details, code) { return new ApiError(409, msg || 'Conflict', details, code); }
  static unprocessable(msg, details, code) { return new ApiError(422, msg || 'Unprocessable entity', details, code); }
}

module.exports = { ApiError };
