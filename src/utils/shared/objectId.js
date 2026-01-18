const mongoose = require("mongoose");
const { ApiError } = require("../../errors/apiError");

function assertObjectId(value, label) {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    const name = label || "id";
    throw ApiError.badRequest(`Invalid ${name}`);
  }
  return value;
}

module.exports = { assertObjectId };

